"use client";

import { useTranslations } from "next-intl";

import { ToneBadge } from "@/components/ui/tone-badge";

/** Active / Inactive pill, one style everywhere. */
export function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations("common");
  return <ToneBadge tone={active ? "success" : "neutral"}>{active ? t("active") : t("inactive")}</ToneBadge>;
}
