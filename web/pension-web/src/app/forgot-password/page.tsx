"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { IconCircleArrowLeftFilled } from "@tabler/icons-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { CaptchaImage, useCaptcha } from "@/components/auth/captcha-field";
import { PasswordPolicyChecklist } from "@/components/auth/password-policy-checklist";
import { PasswordInput } from "@/components/inputs/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import { api } from "@/lib/client/api";
import { filledIn, sameAs } from "@/lib/forms";
import { mobile, otpCode, password, userCode, captchaAnswer } from "@/lib/shared/validators";

const requestSchema = z.object({ user_code: userCode, mobile, captcha_answer: captchaAnswer });
const resetSchema = z.object({ otp: otpCode, new_password: password, confirm_password: filledIn }).superRefine(sameAs("new_password", "confirm_password"));
type RequestValues = z.input<typeof requestSchema>;
type ResetValues = z.input<typeof resetSchema>;

/**
 * Forgot password. Step 1 always answers with the same generic message (it never reveals whether
 * the User ID and mobile match). Step 2 sets the new password with the SMS OTP; success goes to
 * /login, where a toast confirms it. The User ID is kept in memory only, between the two steps.
 */
export default function ForgotPasswordPage() {
  const t = useTranslations("forgot");
  const [userId, setUserId] = useState<string | null>(null);
  return (
    <AuthShell title={t("title")} subtitle={userId ? t("step2Subtitle") : t("step1Subtitle")}>
      {userId ? <ResetStep userCode={userId} onBack={() => setUserId(null)} /> : <RequestStep onSent={setUserId} />}
      <Button asChild variant="link" className="mt-4 w-full">
        <a href="/login">
          <IconCircleArrowLeftFilled className="size-4" />
          {t("backToSignIn")}
        </a>
      </Button>
    </AuthShell>
  );
}

function RequestStep({ onSent }: { onSent: (userCode: string) => void }) {
  const t = useTranslations("forgot");
  const tAuth = useTranslations("auth");
  const errorText = useApiErrorText();
  const { captcha, failed, reload } = useCaptcha();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RequestValues>({ resolver: zodResolver(requestSchema), defaultValues: { user_code: "", mobile: "", captcha_answer: "" } });

  const submit = form.handleSubmit(async (v) => {
    if (!captcha) return;
    setError(null);
    try {
      const parsed = requestSchema.parse(v);
      await api.post("/api/auth/password/forgot", { user_code: parsed.user_code, mobile: parsed.mobile, captcha_token: captcha.token, captcha_answer: parsed.captcha_answer });
      onSent(parsed.user_code);
    } catch (err) {
      setError(errorText(err));
      form.setValue("captcha_answer", "");
      void reload();
    }
  });

  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form method="post" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="user_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("userId")}</FormLabel>
              <FormControl>
                <Input {...field} className="h-11" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" maxLength={32} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="mobile"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("mobile")}</FormLabel>
              <FormControl>
                <Input {...field} className="h-11" inputMode="tel" autoComplete="tel-national" maxLength={16} />
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
                  <InputGroupInput {...field} className="h-full text-center font-semibold tracking-widest placeholder:font-normal placeholder:tracking-normal" inputMode="numeric" placeholder={tAuth("captchaPh")} autoComplete="off" maxLength={2} />
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
          {t("sendOtp")}
        </Button>
      </form>
    </Form>
  );
}

function ResetStep({ userCode: user, onBack }: { userCode: string; onBack: () => void }) {
  const t = useTranslations("forgot");
  const errorText = useApiErrorText();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ResetValues>({ resolver: zodResolver(resetSchema), defaultValues: { otp: "", new_password: "", confirm_password: "" } });
  const newPassword = form.watch("new_password");

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/api/auth/password/reset", { user_code: user, otp: v.otp, new_password: v.new_password });
      window.location.assign("/login?changed=1");
    } catch (err) {
      setError(errorText(err));
    }
  });

  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form method="post" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <Alert>
          <AlertDescription>{t("otpSentGeneric")}</AlertDescription>
        </Alert>
        <FormField
          control={form.control}
          name="otp"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("otp")}</FormLabel>
              <FormControl>
                <Input {...field} className="h-11" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="new_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("newPassword")}</FormLabel>
              <FormControl>
                <PasswordInput {...field} className="h-11" autoComplete="new-password" maxLength={64} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <PasswordPolicyChecklist value={newPassword} />
        <FormField
          control={form.control}
          name="confirm_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("confirmPassword")}</FormLabel>
              <FormControl>
                <PasswordInput {...field} className="h-11" autoComplete="new-password" maxLength={64} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy && <Spinner />}
          {t("resetPassword")}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onBack}>
          {t("startOver")}
        </Button>
      </form>
    </Form>
  );
}
