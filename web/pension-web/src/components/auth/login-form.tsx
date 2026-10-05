"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { CaptchaImage, useCaptcha } from "@/components/auth/captcha-field";
import { CenterPicker } from "@/components/auth/center-picker";
import { TotpStep } from "@/components/auth/totp-step";
import { SwitchAssignmentDialog } from "@/components/dashboard/switch-assignment-dialog";
import { PasswordInput } from "@/components/inputs/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import type { LoginResult } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { centerCode, loginPassword, userCode, captchaAnswer } from "@/lib/shared/validators";

type Tab = "center" | "office";
type Step = { kind: "credentials" } | { kind: "mfa" } | { kind: "enroll"; otpauthUrl: string; secret: string };

/** Remembered tab: a non-sensitive UI preference, nothing else is kept. */
const TAB_COOKIE = "hp_login_tab";
const readTab = (): Tab => (typeof document !== "undefined" && document.cookie.includes(`${TAB_COOKIE}=office`) ? "office" : "center");
const writeTab = (tab: Tab) => {
  document.cookie = `${TAB_COOKIE}=${tab}; path=/login; max-age=${180 * 24 * 3600}; samesite=strict${location.protocol === "https:" ? "; secure" : ""}`;
};

/** State / District sign-in: no Center code (the field is ignored and never sent). */
const officeSchema = z.object({ center_code: z.string().optional(), user_code: userCode, password: loginPassword, captcha_answer: captchaAnswer });
const centerSchema = officeSchema.extend({ center_code: centerCode });
type Values = z.input<typeof officeSchema>;

/** Only a dashboard path may be the landing page after sign-in (no open redirect). */
export const safeNext = (raw: string | null | undefined): string => (raw && /^\/dashboard(\/[A-Za-z0-9/_-]*)?$/.test(raw) ? raw : "/dashboard");

/**
 * Sign-in: credentials (+ captcha), then MFA_REQUIRED (6 digit code) or MFA_ENROLL (QR + secret +
 * code) when the role needs TOTP. On DONE: a temporary password goes to /change-password, an
 * account with several assignments picks one, everyone else lands on the dashboard.
 */
export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [tab, setTab] = useState<Tab>("center");
  const [step, setStep] = useState<Step>({ kind: "credentials" });
  const [notice, setNotice] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => setTab(readTab()), []);

  const finish = (r: LoginResult) => {
    // Full navigations: the dashboard layout and the change-password page read the new cookies on the server.
    if (r.must_change_password) return window.location.assign("/change-password");
    if (r.needs_selection) return setPicking(true);
    window.location.assign(next);
  };

  const onStep = (r: LoginResult) => {
    setNotice(null);
    if (r.step === "DONE") return finish(r);
    if (r.step === "MFA_ENROLL" && r.otpauth_url && r.secret) return setStep({ kind: "enroll", otpauthUrl: r.otpauth_url, secret: r.secret });
    setStep({ kind: "mfa" });
  };

  // After sign-in, an account with several assignments picks one; closing the picker keeps the default.
  const picker = <SwitchAssignmentDialog open={picking} onOpenChange={(o) => !o && window.location.assign(next)} afterLogin onSwitched={() => window.location.assign(next)} />;

  if (step.kind !== "credentials") {
    return (
      <>
        <TotpStep
          mode={step.kind}
          otpauthUrl={step.kind === "enroll" ? step.otpauthUrl : undefined}
          secret={step.kind === "enroll" ? step.secret : undefined}
          onDone={onStep}
          onRestart={(message) => {
            setNotice(message);
            setStep({ kind: "credentials" });
          }}
        />
        {picker}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          const chosen: Tab = v === "office" ? "office" : "center";
          setTab(chosen);
          writeTab(chosen);
        }}
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-full">
          <TabsTrigger value="center">{t("tabCenter")}</TabsTrigger>
          <TabsTrigger value="office">{t("tabOffice")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {notice && (
        <Alert variant="destructive">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <CredentialsForm key={tab} withCenter={tab === "center"} onStep={onStep} />
      {picker}
    </div>
  );
}

function CredentialsForm({ withCenter, onStep }: { withCenter: boolean; onStep: (r: LoginResult) => void }) {
  const t = useTranslations("auth");
  const errorText = useApiErrorText();
  const { captcha, failed, reload } = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(withCenter ? centerSchema : officeSchema) as Resolver<Values>,
    defaultValues: { center_code: "", user_code: "", password: "", captcha_answer: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    if (!captcha) return;
    setError(null);
    try {
      const body = {
        ...(withCenter ? { center_code: values.center_code } : {}),
        user_code: values.user_code,
        password: values.password,
        captcha_token: captcha.token,
        captcha_answer: values.captcha_answer,
      };
      onStep(await api.post<LoginResult>("/api/auth/login", body));
    } catch (err) {
      setError(errorText(err));
      // The captcha token is spent whether the answer was right or not.
      form.setValue("captcha_answer", "");
      form.setValue("password", "");
      void reload();
    }
  });

  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form method="post" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate autoComplete="on">
        {withCenter && (
          <FormField
            control={form.control}
            name="center_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel required>{t("centerCode")}</FormLabel>
                <FormControl>
                  <CenterPicker value={field.value ?? ""} onChange={(code) => field.onChange(code)} invalid={!!form.formState.errors.center_code} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        <FormField
          control={form.control}
          name="user_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("userId")}</FormLabel>
              <FormControl>
                <Input {...field} className="h-11" placeholder={t("userIdPh")} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" maxLength={32} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel required>{t("password")}</FormLabel>
                <a href="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                  {t("forgotPassword")}
                </a>
              </div>
              <FormControl>
                <PasswordInput {...field} className="h-11" placeholder={t("passwordPh")} autoComplete="current-password" maxLength={128} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="captcha_answer"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("captcha")}</FormLabel>
              <CaptchaImage captcha={captcha} failed={failed} onReload={() => void reload()}>
                <FormControl>
                  <InputGroupInput {...field} className="h-full text-center font-semibold tracking-widest placeholder:font-normal placeholder:tracking-normal" inputMode="numeric" placeholder={t("captchaPh")} autoComplete="off" maxLength={2} />
                </FormControl>
              </CaptchaImage>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy || !captcha}>
          {busy && <Spinner />}
          {busy ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </Form>
  );
}
