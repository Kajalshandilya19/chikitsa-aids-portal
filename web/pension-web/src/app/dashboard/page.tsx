"use client";

import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/dashboard/page-header";
import { useSession } from "@/providers/session-provider";

/**
 * Home. Empty on purpose until Phase 1: the counters (beneficiaries, applications, pending
 * verification, PPOs) arrive with the data they count. Build them with `KpiCard`
 * (components/dashboard/kpi-card.tsx), one per counter, as the phase guides describe.
 */
export default function DashboardHome() {
  const t = useTranslations("dashboard");
  const { user } = useSession();
  return <PageHeader title={t("welcome", { name: user.name })} description={t("intro")} />;
}
