"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
import { useTranslations } from "next-intl";
import { z } from "zod";

import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordPolicyChecklist } from "@/components/auth/password-policy-checklist";
import { PasswordInput } from "@/components/inputs/password-input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import type { Me } from "@/lib/api-types";
import { api, goToLogin } from "@/lib/client/api";
import { filledIn, sameAs } from "@/lib/forms";
import { loginPassword, otpCode, password } from "@/lib/shared/validators";

const base = z.object({ current_password: loginPassword, otp: z.string().optional(), new_password: password, confirm_password: filledIn });
/** First login (temporary password): the SMS OTP is required too. */
const firstLoginSchema = base.extend({ otp: otpCode }).superRefine(sameAs("new_password", "confirm_password"));
const normalSchema = base.superRefine(sameAs("new_password", "confirm_password"));
type Values = z.input<typeof base>;

/**
 * Change password: for a temporary password (must_change_password, the dashboard sends the user
 * here) and for a normal change from My Profile. On success auth-service revokes every session of
 * the user, the BFF drops the cookies, and the user signs in again on /login (toast after mount).
 */
export default function ChangePasswordPage() {
  const t = useTranslations("changePassword");
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    // A 401 here sends the browser to /login?expired=1 (lib/client/api.ts).
    api.get<Me>("/api/auth/me").then(setMe).catch(() => undefined);
  }, []);
  return (
    <AuthShell title={t("title")} subtitle={me?.must_change_password ? t("firstLoginSubtitle") : t("subtitle")}>
      {me ? (
        <ChangePasswordForm mustChange={me.must_change_password} />
      ) : (
        <div className="space-y-3">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      )}
    </AuthShell>
  );
}

function ChangePasswordForm({ mustChange }: { mustChange: boolean }) {
  const t = useTranslations("changePassword");
  const errorText = useApiErrorText();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(mustChange ? firstLoginSchema : normalSchema) as Resolver<Values>,
    defaultValues: { current_password: "", otp: "", new_password: "", confirm_password: "" },
  });
  const newPassword = form.watch("new_password");

  const sendOtp = async () => {
    setSending(true);
    setError(null);
    try {
      const r = await api.post<{ sent_to: string; expires_in: number }>("/api/auth/password/otp");
      setSentTo(r.sent_to);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const submit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.post("/api/auth/password/change", {
        current_password: v.current_password,
        new_password: v.new_password,
        ...(mustChange ? { otp: v.otp } : {}),
      });
      window.location.assign("/login?changed=1");
    } catch (err) {
      setError(errorText(err));
    }
  });

  const leave = async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    goToLogin("logout");
  };

  const busy = form.formState.isSubmitting;
  return (
    <Form {...form}>
      <form method="post" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="current_password"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>{mustChange ? t("temporaryPassword") : t("currentPassword")}</FormLabel>
              <FormControl>
                <PasswordInput {...field} className="h-11" autoComplete="current-password" maxLength={128} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {mustChange && (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{sentTo ? t("otpSentTo", { mobile: sentTo }) : t("otpNeeded")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void sendOtp()} disabled={sending}>
                {sending && <Spinner />}
                {sentTo ? t("resendOtp") : t("sendOtp")}
              </Button>
            </div>
            <FormField
              control={form.control}
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("otp")}</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} className="h-11" inputMode="numeric" autoComplete="one-time-code" maxLength={6} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}
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
          {t("submit")}
        </Button>
        {mustChange ? (
          <Button type="button" variant="ghost" className="w-full" onClick={() => void leave()}>
            {t("logout")}
          </Button>
        ) : (
          <Button asChild variant="ghost" className="w-full">
            <a href="/dashboard/profile">{t("cancel")}</a>
          </Button>
        )}
      </form>
    </Form>
  );
}
