"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { z } from "zod";
import { IconCircleArrowLeftFilled, IconCopyFilled } from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import type { LoginResult } from "@/lib/api-types";
import { ApiError, api } from "@/lib/client/api";
import { totpCode } from "@/lib/shared/validators";

const schema = z.object({ totp_code: totpCode });
type Values = z.input<typeof schema>;

/** Codes that make the sign-in attempt unusable: start again from the password. */
const RESTART = new Set(["E_MFA_LOCKED", "E_MFA_EXPIRED", "E_MFA_TOKEN_INVALID"]);

/**
 * Second sign-in step. `mfa`: the 6 digit code from the authenticator app. `enroll`: the account has
 * no authenticator yet, so first show the QR code (drawn here from the otpauth URL, never fetched
 * from anywhere) and the secret for manual entry; the first correct code switches MFA on.
 */
export function TotpStep({
  mode,
  otpauthUrl,
  secret,
  onDone,
  onRestart,
}: {
  mode: "mfa" | "enroll";
  otpauthUrl?: string;
  secret?: string;
  onDone: (r: LoginResult) => void;
  onRestart: (message: string) => void;
}) {
  const t = useTranslations("auth");
  const errorText = useApiErrorText();
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { totp_code: "" } });

  useEffect(() => {
    if (mode !== "enroll" || !otpauthUrl) return;
    let live = true;
    void import("qrcode").then(async (QR) => {
      const url = await QR.toDataURL(otpauthUrl, { margin: 1, width: 200, errorCorrectionLevel: "M" });
      if (live) setQr(url);
    });
    return () => {
      live = false;
    };
  }, [mode, otpauthUrl]);

  const submit = form.handleSubmit(async ({ totp_code }) => {
    setError(null);
    try {
      onDone(await api.post<LoginResult>("/api/auth/login/mfa", { totp_code }));
    } catch (err) {
      if (err instanceof ApiError && RESTART.has(err.code)) return onRestart(errorText(err));
      setError(errorText(err));
      form.setValue("totp_code", "");
    }
  });

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      toast.success(t("secretCopied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form method="post" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate autoComplete="off">
        <div>
          <h2 className="text-lg font-semibold">{mode === "enroll" ? t("enrollTitle") : t("mfaTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "enroll" ? t("enrollIntro") : t("mfaIntro")}</p>
        </div>
        {mode === "enroll" && (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>{t("enrollStep1")}</li>
              <li>{t("enrollStep2")}</li>
              <li>{t("enrollStep3")}</li>
            </ol>
            <div className="flex justify-center">
              <div className="rounded-lg border bg-white p-2">
                {/* A data URL drawn in this browser from the otpauth URL. */}
                {qr ? <img src={qr} alt={t("qrAlt")} width={200} height={200} /> : <Skeleton className="size-[200px]" />}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t("secretLabel")}</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm tracking-wider">{secret}</code>
                <Button type="button" variant="outline" size="icon" className="size-10" onClick={() => void copySecret()} aria-label={t("copySecret")} title={t("copySecret")}>
                  <IconCopyFilled className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
        <FormField
          control={form.control}
          name="totp_code"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{t("totpLabel")}</FormLabel>
              <FormControl>
                <InputOTP maxLength={6} inputMode="numeric" autoComplete="one-time-code" autoFocus value={field.value} onChange={field.onChange} onBlur={field.onBlur} name={field.name}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }, (_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
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
          {t("verify")}
        </Button>
        <Button type="button" variant="link" className="w-full" onClick={() => onRestart("")}>
          <IconCircleArrowLeftFilled className="size-4" />
          {t("backToSignIn")}
        </Button>
      </form>
    </Form>
  );
}
