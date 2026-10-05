"use client";

import { useTranslations } from "next-intl";
import { IconCircleCheckFilled as CircleCheck, IconInfoCircleFilled as Info, IconAlertCircleFilled as OctagonAlert, IconAlertTriangleFilled as TriangleAlert } from "@tabler/icons-react";
type LucideIcon = import("react").ComponentType<import("react").SVGProps<SVGSVGElement>>;

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type ConfirmVariant = "danger" | "warning" | "info" | "success";

const VARIANT: Record<
  ConfirmVariant,
  { Icon: LucideIcon; tone: string; confirm: "default" | "destructive" }
> = {
  danger: { Icon: OctagonAlert, tone: "bg-destructive/10 text-destructive", confirm: "destructive" },
  warning: {
    Icon: TriangleAlert,
    tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    confirm: "default",
  },
  info: { Icon: Info, tone: "bg-primary/10 text-primary", confirm: "default" },
  success: {
    Icon: CircleCheck,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    confirm: "default",
  },
};

export interface ConfirmDialogContent {
  title: string;
  description?: string;
  /** Listed under the description, one line each: the things being confirmed, when there are several. */
  details?: string[];
  variant?: ConfirmVariant;
  confirmText?: string;
  cancelText?: string;
  // minLength/maxLength mirror the backend DTO's bounds so the dialog blocks a
  // too-short reason with an inline hint instead of letting the API 400 on it.
  reason?: { placeholder?: string; required?: boolean; minLength?: number; maxLength?: number };
}

// Presentational typed confirm/alert dialog. Driven by the ConfirmProvider -
// don't render this directly; call `useConfirm()` instead.
export function ConfirmDialog({
  open,
  content,
  reason,
  onReasonChange,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  content: ConfirmDialogContent | null;
  reason: string;
  onReasonChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  if (!content) return null;
  const v = VARIANT[content.variant ?? "info"];
  const Icon = v.Icon;
  const trimmed = reason.trim();
  const minLength = content.reason?.minLength ?? (content.reason?.required ? 1 : 0);
  const reasonTooShort = Boolean(content.reason) && trimmed.length > 0 && trimmed.length < minLength;
  const confirmDisabled = Boolean(content.reason) && trimmed.length < minLength;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                v.tone,
              )}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <DialogTitle>{content.title}</DialogTitle>
              {content.description && <DialogDescription>{content.description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>

        {content.details && content.details.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {content.details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {content.reason && (
          <div className="space-y-1.5">
            <Textarea
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder={content.reason.placeholder}
              maxLength={content.reason.maxLength}
              aria-invalid={reasonTooShort ? true : undefined}
              rows={3}
              autoFocus
            />
            {reasonTooShort && (
              <p className="text-destructive text-sm">
                {t("reasonTooShort", { min: minLength })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {/* The ONE Cancel in the app that is not destructive-tinted.
              Everywhere else Cancel discards a half-typed form, and the red tint says so. Here it
              is the SAFE way out of a delete, sitting next to a Delete that is itself destructive
             , tint both and the two buttons become the same button, which is the one place that
              actually costs a record. */}
          <Button variant="outline" onClick={onCancel}>
            {content.cancelText ?? t("cancel")}
          </Button>
          <Button variant={v.confirm} onClick={onConfirm} disabled={confirmDisabled}>
            {content.confirmText ?? t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
