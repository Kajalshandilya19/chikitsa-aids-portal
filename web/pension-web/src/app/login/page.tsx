"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm, safeNext } from "@/components/auth/login-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMountToast } from "@/hooks/use-mount-toast";

/** Sign-in. `?expired=1`: the session timed out. `?changed=1`: the password was just changed or reset. */
function LoginPage() {
  const t = useTranslations("auth");
  const params = useSearchParams();
  const expired = params.get("expired") === "1";
  useMountToast(params.get("changed") === "1" ? t("passwordChangedToast") : null);
  return (
    <AuthShell title={t("welcome")} subtitle={t("signInSubtitle")}>
      {expired && (
        <Alert className="mb-4">
          <AlertDescription>{t("sessionExpired")}</AlertDescription>
        </Alert>
      )}
      <LoginForm next={safeNext(params.get("next"))} />
    </AuthShell>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
