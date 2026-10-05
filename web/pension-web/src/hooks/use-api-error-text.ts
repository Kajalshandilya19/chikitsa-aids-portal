"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

import { ApiError } from "@/lib/client/api";

import { stripRuleId, useValidationText } from "./use-validation-text";

/**
 * A failed call as one friendly sentence in the active language: `errors.<CODE>` when the code is
 * known (src/messages/*.json), the first field message for E_VALIDATION, else the service's own
 * message (always a plain sentence with no personal data, API conventions).
 */
export function useApiErrorText(): (err: unknown) => string {
  const t = useTranslations("errors");
  const vt = useValidationText();
  return useCallback(
    (err) => {
      if (!(err instanceof ApiError)) return t("generic");
      if (err.code === "E_ACCOUNT_LOCKED") {
        const d = err.details as { retry_after_minutes?: unknown } | undefined;
        const minutes = typeof d?.retry_after_minutes === "number" ? d.retry_after_minutes : null;
        return minutes ? t("E_ACCOUNT_LOCKED_MINUTES", { minutes }) : t("E_ACCOUNT_LOCKED");
      }
      if (err.code === "E_VALIDATION" && Array.isArray(err.details)) {
        const first = (err.details as { message?: unknown }[]).find((d) => typeof d.message === "string");
        if (first) return vt(first.message as string);
      }
      if (t.has(err.code)) return t(err.code);
      return stripRuleId(err.message) || t("generic");
    },
    [t, vt],
  );
}
