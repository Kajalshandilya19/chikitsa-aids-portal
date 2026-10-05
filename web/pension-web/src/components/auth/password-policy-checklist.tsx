"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { IconCircleCheckFilled, IconCircleDashed } from "@tabler/icons-react";

import { stripRuleId, useValidationText } from "@/hooks/use-validation-text";
import { password } from "@/lib/shared/validators";
import { cn } from "@/lib/utils";

/**
 * Every rule of the V-006 password policy, read FROM the schema in validators.ts: two probe values
 * between them fail every check, and the union of their messages is the checklist. A rule added to
 * or changed in validators.ts shows up here without touching this file.
 */
const POLICY_MESSAGES: readonly string[] = (() => {
  const all = new Set<string>();
  for (const probe of ["", ` ${"a".repeat(70)} `]) {
    const r = password.safeParse(probe);
    if (!r.success) for (const issue of r.error.issues) all.add(issue.message);
  }
  return [...all];
})();

/** Live V-006 checklist under a new-password field. */
export function PasswordPolicyChecklist({ value, className }: { value: string; className?: string }) {
  const t = useTranslations("changePassword");
  const vt = useValidationText();
  const failing = useMemo(() => {
    const r = password.safeParse(value ?? "");
    return new Set(r.success ? [] : r.error.issues.map((i) => i.message));
  }, [value]);
  return (
    <div className={cn("rounded-lg border bg-muted/40 p-3", className)}>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("policyTitle")}</p>
      <ul className="space-y-1">
        {POLICY_MESSAGES.map((m) => {
          const ok = value.length > 0 && !failing.has(m);
          return (
            <li key={m} className={cn("flex items-center gap-2 text-xs", ok ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
              {ok ? <IconCircleCheckFilled className="size-4 shrink-0" aria-hidden /> : <IconCircleDashed className="size-4 shrink-0" aria-hidden />}
              <span>{stripRuleId(vt(m))}</span>
              <span className="sr-only">{ok ? t("ruleMet") : t("ruleNotMet")}</span>
            </li>
          );
        })}
        <li className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconCircleDashed className="size-4 shrink-0" aria-hidden />
          <span>{t("policyServerRules")}</span>
        </li>
      </ul>
    </div>
  );
}
