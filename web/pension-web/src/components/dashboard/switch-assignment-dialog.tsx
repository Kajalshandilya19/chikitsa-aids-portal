"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { IconCircleCheckFilled } from "@tabler/icons-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import type { AssignmentOption, SessionOptions } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** "State", "Ajmer", or "RJ001 Ajmer ART Centre": where an assignment works. */
export function placeLabel(a: Pick<AssignmentOption, "district" | "center">, locale: string, stateLabel: string): string {
  const name = (p: { name_en: string; name_hi: string | null }) => (locale === "hi" && p.name_hi ? p.name_hi : p.name_en);
  if (a.center) return `${a.center.code} ${name(a.center)}`;
  if (a.district) return name(a.district);
  return stateLabel;
}

/**
 * Role / place picker. Opened after sign-in when the account has several assignments
 * (`needs_selection`), and from the header's switch button. auth-service ends the current session
 * and starts a new one in the chosen assignment; every cached query of the old role is dropped.
 */
export function SwitchAssignmentDialog({
  open,
  onOpenChange,
  onSwitched,
  afterLogin = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSwitched?: () => void;
  /** Wording for the first choice after sign-in rather than a later switch. */
  afterLogin?: boolean;
}) {
  const t = useTranslations("workspace");
  const locale = useLocale();
  const qc = useQueryClient();
  const errorText = useApiErrorText();
  const [opts, setOpts] = useState<SessionOptions | null>(null);
  const [chosen, setChosen] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    api
      .get<SessionOptions>("/api/auth/options")
      .then((o) => {
        setOpts(o);
        setChosen(o.current_assignment_id);
      })
      .catch((err: unknown) => setError(errorText(err)));
  }, [open, errorText]);

  const confirm = async () => {
    if (!opts || !chosen) return;
    if (chosen === opts.current_assignment_id) {
      onOpenChange(false);
      if (afterLogin) onSwitched?.();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/switch", { assignment_id: chosen });
      await qc.cancelQueries();
      qc.clear();
      if (onSwitched) onSwitched();
      else window.location.assign("/dashboard");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const roleName = (a: AssignmentOption) => (a.role ? (locale === "hi" && a.role.name_hi ? a.role.name_hi : a.role.name_en) : "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary">{afterLogin ? t("chooseTitle") : t("switchTitle")}</DialogTitle>
          <DialogDescription>{t("switchSubtitle")}</DialogDescription>
        </DialogHeader>
        {!opts ? (
          error ? null : (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          )
        ) : (
          <div role="radiogroup" aria-label={t("assignment")} className="max-h-[50svh] space-y-2 overflow-y-auto">
            {opts.assignments.map((a) => {
              const on = a.id === chosen;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setChosen(a.id)}
                  className={cn("flex w-full items-center gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors", on ? "border-primary bg-accent" : "hover:bg-muted")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{roleName(a)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {a.role ? t(`scope.${a.role.scope}`) : ""} · {placeLabel(a, locale, t("scope.STATE"))}
                    </span>
                  </span>
                  {a.id === opts.current_assignment_id && <span className="text-[10px] font-semibold uppercase text-muted-foreground">{t("current")}</span>}
                  {on && <IconCircleCheckFilled className="size-5 shrink-0 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy || !opts || !chosen}>
            {busy && <Spinner />}
            {t("continue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
