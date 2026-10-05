import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Status pill: soft fill, no border, no dot. One style for every status in the portal. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "dark";

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  danger: "bg-destructive/10 text-destructive",
  dark: "bg-zinc-800 text-white dark:bg-zinc-200 dark:text-zinc-900",
};

export function ToneBadge({ tone, className, children, title }: { tone: Tone; className?: string; children: ReactNode; title?: string }) {
  return (
    <Badge title={title} className={cn("border-transparent font-medium", TONE[tone], className)}>
      {children}
    </Badge>
  );
}
