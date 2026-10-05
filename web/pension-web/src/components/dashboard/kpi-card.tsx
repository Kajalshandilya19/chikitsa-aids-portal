"use client";

import type { ComponentType, SVGProps } from "react";
import Link from "next/link";

import { Skeleton } from "@/components/ui/skeleton";
import { paletteFor, type ReportPalette } from "@/lib/client/palette";
import { cn } from "@/lib/utils";

const nf = new Intl.NumberFormat("en-IN");

export interface KpiCardProps {
  title: string;
  /** The number. Omit together with `placeholder` for a metric that does not exist yet. */
  value?: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  accentIndex: number;
  isLoading?: boolean;
  palette?: ReportPalette;
  /** Preformatted value ("72.9%") shown instead of the formatted number. */
  display?: string;
  /** Shown instead of a value, muted (e.g. "Available in Phase 1"). */
  placeholder?: string;
  /** Makes the whole tile a link. */
  href?: string;
}

/** Compact dashboard KPI tile: accent icon chip + label on top, big value below. */
export function KpiCard({ title, value, icon: Icon, accentIndex, isLoading, palette, display, placeholder, href }: KpiCardProps) {
  const p = palette ?? paletteFor(accentIndex);
  const text = display ?? (value === undefined ? "" : nf.format(value));
  const card = (
    <div className={cn("flex h-full flex-col justify-center gap-2 rounded-xl border-2 border-dotted bg-card p-3.5 transition-colors", p.card, href && "cursor-pointer hover:border-primary/50 hover:bg-accent/30")}>
      <div className="flex items-center gap-2">
        <div className={cn("grid size-8 shrink-0 place-items-center rounded-lg", p.iconWrap)}>
          <Icon className="size-4" />
        </div>
        <p title={title} className="line-clamp-2 text-[13px] leading-tight font-medium text-muted-foreground">
          {title}
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-20" />
      ) : placeholder ? (
        <p className="text-sm font-semibold text-muted-foreground">{placeholder}</p>
      ) : (
        <div className={cn("leading-none font-extrabold tracking-tight whitespace-nowrap tabular-nums", text.length > 12 ? "text-xl" : text.length > 9 ? "text-2xl" : "text-[1.75rem]")}>{text}</div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}
