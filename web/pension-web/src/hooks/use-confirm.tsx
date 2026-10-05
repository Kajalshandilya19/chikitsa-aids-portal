"use client";

import { useCallback, useState, type ReactNode } from "react";

import { ConfirmDialog, type ConfirmDialogContent } from "@/components/ui/confirm-dialog";

/**
 * `const [confirmDialog, confirm] = useConfirm();` then render `{confirmDialog}` once and call
 * `confirm({ title, description, variant }, async () => { ... })`. The action runs on Confirm only.
 */
export function useConfirm(): [ReactNode, (content: ConfirmDialogContent, action: () => Promise<void> | void) => void] {
  const [state, setState] = useState<{ content: ConfirmDialogContent; action: () => Promise<void> | void } | null>(null);
  const [reason, setReason] = useState("");
  const ask = useCallback((content: ConfirmDialogContent, action: () => Promise<void> | void) => {
    setReason("");
    setState({ content, action });
  }, []);
  const dialog = (
    <ConfirmDialog
      open={!!state}
      content={state?.content ?? null}
      reason={reason}
      onReasonChange={setReason}
      onCancel={() => setState(null)}
      onConfirm={() => {
        const action = state?.action;
        setState(null);
        void action?.();
      }}
    />
  );
  return [dialog, ask];
}
