"use client";

import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

/**
 * Government of Rajasthan lockup, State Emblem of India + bilingual wordmark.
 *
 * The emblem is `/emblem-of-india.svg` (official gazette artwork, optimized)
 * applied as a CSS mask over `currentColor`, so the mark inherits text color
 * and adapts to light/dark themes with zero JS bundle cost. The lockup text is
 * fixed official branding (always Devanagari + English, like `siteConfig.org`),
 * not locale-dependent copy, the accessible name is translated instead.
 */

const EMBLEM_URL = "/emblem-of-india.svg";

export function EmblemMark({ className }: { className?: string }) {
  const mask = {
    maskImage: `url(${EMBLEM_URL})`,
    maskRepeat: "no-repeat",
    maskSize: "contain",
    maskPosition: "center",
    WebkitMaskImage: `url(${EMBLEM_URL})`,
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    WebkitMaskPosition: "center",
  } as const;
  return (
    <span
      aria-hidden
      // Emblem viewBox is 145.5 x 207.8, keep the intrinsic aspect.
      className={cn("inline-block aspect-[145.5/207.8] bg-current", className)}
      style={mask}
    />
  );
}

export interface GovtRajasthanLogoProps {
  variant?: "horizontal" | "stacked";
  className?: string;
}

export function GovtRajasthanLogo({ variant = "horizontal", className }: GovtRajasthanLogoProps) {
  const t = useTranslations("auth");

  if (variant === "stacked") {
    return (
      <div
        role="img"
        aria-label={t("govtOfRajasthan")}
        className={cn("flex flex-col items-center text-center", className)}
      >
        <EmblemMark className="h-12" />
        <span aria-hidden className="mt-1 text-[7px] font-medium leading-none tracking-wide">
          सत्यमेव जयते
        </span>
        <span aria-hidden className="mt-1.5 text-sm font-bold leading-none">
          राजस्थान सरकार
        </span>
        <span aria-hidden className="mt-1 text-[8px] font-semibold leading-none tracking-[0.14em]">
          GOVERNMENT OF RAJASTHAN
        </span>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={t("govtOfRajasthan")}
      className={cn("flex items-center gap-1.5 sm:gap-2", className)}
    >
      {/* Phones get a tighter cut so it fits beside the RSACS lockup down to a 360px screen. */}
      <EmblemMark className="h-8 shrink-0 sm:h-9" />
      <div aria-hidden className="flex min-w-0 flex-col justify-center whitespace-nowrap">
        <span className="text-[13px] font-bold leading-tight sm:text-sm">राजस्थान सरकार</span>
        <span className="text-[7px] font-semibold leading-tight tracking-[0.08em] sm:text-[8px] sm:tracking-[0.12em]">
          GOVERNMENT OF RAJASTHAN
        </span>
      </div>
    </div>
  );
}
