"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Validation messages come from the zod schemas in src/lib/shared/validators.ts (byte-identical to
 * the services), in English, ending with their rule id: "Mobile number must be 10 digits ... (V-004)".
 *
 * English shows the schema's own sentence without its rule id. Hindi shows `validation.byText.<sentence>` when that exact
 * sentence is translated (the password checklist), else the rule's general Hindi description
 * `validation.byRule.V004`, else the English sentence. So a rule changed in validators.ts never
 * shows a stale Hindi text: at worst it shows the new English one.
 */
const RULE = /\s*\((V-\d{3})\)\s*$/;

export const stripRuleId = (message: string): string => message.replace(RULE, "");

export function useValidationText(): (message: string | undefined | null) => string {
  const t = useTranslations("validation");
  const locale = useLocale();
  return useCallback(
    (message) => {
      if (!message) return "";
      // The rule id is for developers (docs/VALIDATION_RULES.md); users never see "(V-0xx)".
      if (locale === "en") return stripRuleId(message);
      const plain = stripRuleId(message);
      // A message key cannot contain "." (next-intl nesting), so such sentences skip the exact lookup.
      if (!plain.includes(".") && t.has(`byText.${plain}`)) return t(`byText.${plain}`);
      const rule = RULE.exec(message)?.[1];
      if (rule && t.has(`byRule.${rule.replace("-", "")}`)) return t(`byRule.${rule.replace("-", "")}`);
      return plain;
    },
    [t, locale],
  );
}
