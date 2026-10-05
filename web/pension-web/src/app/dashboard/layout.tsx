import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ServiceDown } from "@/components/dashboard/service-down";
import type { Me } from "@/lib/api-types";
import { getAccessToken } from "@/lib/server/session";
import { callService } from "@/lib/server/upstream";

/**
 * The real session check for every dashboard page: the access token is verified by auth-service
 * (/auth/me), not by cookie presence. An expired token goes through the refresh redirect (a Server
 * Component cannot write cookies); a temporary password goes to /change-password first.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const token = await getAccessToken();
  if (!token) redirect("/api/auth/refresh/redirect?next=/dashboard");
  const me = await callService<Me>("auth", { path: "auth/me", token });
  if (me.status === 401) redirect("/api/auth/refresh/redirect?next=/dashboard");
  if (!me.body?.success) {
    const t = await getTranslations("errors");
    return <ServiceDown title={t("serviceDownTitle")} text={t("serviceDownText")} retry={t("retry")} />;
  }
  if (me.body.data.must_change_password) redirect("/change-password");
  return <DashboardShell user={me.body.data}>{children}</DashboardShell>;
}
