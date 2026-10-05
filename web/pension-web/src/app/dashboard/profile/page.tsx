"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { IconKeyFilled } from "@tabler/icons-react";

import { useScopeText } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { placeLabel } from "@/components/dashboard/switch-assignment-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToneBadge } from "@/components/ui/tone-badge";
import type { SessionOptions } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { localName } from "@/lib/client/format";
import { useSession } from "@/providers/session-provider";

/** My details (from /auth/me), my assignments (from /auth/options), and the way to change my password. */
export default function ProfilePage() {
  const t = useTranslations("profile");
  const tw = useTranslations("workspace");
  const locale = useLocale();
  const { user } = useSession();
  const { role, place } = useScopeText(user);
  const options = useQuery({ queryKey: ["session-options"], queryFn: () => api.get<SessionOptions>("/api/auth/options") });

  const rows: [string, string][] = [
    [t("name"), user.name],
    [t("userId"), user.user_code],
    [t("role"), role],
    [t("scope"), user.role ? tw(`scope.${user.role.scope}`) : ""],
    [t("place"), place],
    [t("permissions"), String(user.permissions.length)],
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button asChild variant="outline">
            <a href="/change-password">
              <IconKeyFilled className="size-4" />
              {t("changePassword")}
            </a>
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("details")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {rows.map(([k, v]) => (
                <div key={k} className="grid grid-cols-3 gap-3 py-2 text-sm">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className="col-span-2 font-medium">{v}</dd>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-3 py-2 text-sm">
                <dt className="text-muted-foreground">{t("mfa")}</dt>
                <dd className="col-span-2">{user.mfa_enabled ? <ToneBadge tone="success">{t("mfaOn")}</ToneBadge> : <ToneBadge tone="neutral">{t("mfaOff")}</ToneBadge>}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("assignments")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {options.isLoading && <Skeleton className="h-14 w-full" />}
            {options.data?.assignments.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{a.role ? localName(a.role, locale) : ""}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {a.role ? tw(`scope.${a.role.scope}`) : ""} · {placeLabel(a, locale, tw("scope.STATE"))}
                  </div>
                </div>
                {a.id === options.data?.current_assignment_id && <ToneBadge tone="info">{tw("current")}</ToneBadge>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
