"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";

import { EmblemMark, GovtRajasthanLogo } from "@/components/auth/govt-rajasthan-logo";
import { cn } from "@/lib/utils";

/** The red ribbon mark (also src/app/icon.svg). Decorative: the lockup carries the name. */
export function PortalMark({ className, plain = false }: { className?: string; /** The ribbon alone, without the white tile. */ plain?: boolean }) {
  return (
    <svg viewBox={plain ? "8 4 48 58" : "0 0 64 64"} aria-hidden className={cn("shrink-0", className)}>
      {!plain && <rect width="64" height="64" rx="14" fill="#ffffff" />}
      <path
        fill="#c8102e"
        d="M32 7c-7.4 0-12.6 5.7-12.6 12.9 0 4.8 2.3 9.4 5.6 14.1L11.5 54l7.3 4.2L32 40.4l13.2 17.8 7.3-4.2L39 34c3.3-4.7 5.6-9.3 5.6-14.1C44.6 12.7 39.4 7 32 7Zm0 7.3c3.1 0 5.2 2.5 5.2 5.7 0 2.9-1.8 6.2-5.2 10.6-3.4-4.4-5.2-7.7-5.2-10.6 0-3.2 2.1-5.7 5.2-5.7Z"
      />
    </svg>
  );
}

/**
 * State Emblem of India + product name + "Rajasthan State AIDS Control Society", in the active
 * language. The emblem is the gazette artwork masked over currentColor, so it follows the theme.
 */
export function PortalLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  const t = useTranslations("brand");
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <EmblemMark className={cn("shrink-0 text-foreground", compact ? "h-8" : "h-11")} />
      <span aria-hidden className={cn("w-px shrink-0 bg-border", compact ? "h-7" : "h-9")} />
      <div className="min-w-0 leading-tight">
        <div className={cn("truncate font-semibold text-foreground", compact ? "text-sm" : "text-base")}>{t("name")}</div>
        <div className={cn("truncate text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>{t("subtitle")}</div>
      </div>
    </div>
  );
}

/**
 * The AIDS-programme lockup: the red ribbon with "RSACS" over "RAJASTHAN STATE / AIDS CONTROL
 * SOCIETY", set in the same type as the Government of Rajasthan lockup (bold name over small tracked
 * caps) so the two read as a pair and fit side by side in the sign-in column. Replace the ribbon with the RSACS logo once the
 * department supplies the artwork (docs/OPEN_QUESTIONS.md Q-23).
 */
/* Phones get a tighter cut so the two lockups sit side by side down to a 360px screen. */
const SUB_CAPS = "text-[6.5px] font-semibold uppercase leading-[1.25] tracking-[0.04em] sm:text-[7.5px] sm:tracking-[0.06em]";

export function AidsLockup({ className, markClassName }: { className?: string; markClassName?: string }) {
  const t = useTranslations("brand");
  return (
    <div role="img" aria-label={t("subtitle")} className={cn("flex min-w-0 shrink items-center gap-1.5 text-foreground sm:gap-2", className)}>
      <PortalMark plain className={cn("h-9 w-auto shrink-0 sm:h-11", markClassName)} />
      <div aria-hidden className="flex min-w-0 flex-col justify-center whitespace-nowrap">
        <span className="text-[13px] font-bold leading-tight sm:text-sm">{t("short")}</span>
        <span className={SUB_CAPS}>{t("subtitleLine1")}</span>
        <span className={SUB_CAPS}>{t("subtitleLine2")}</span>
      </div>
    </div>
  );
}

/** Top of the sign-in card: AIDS lockup | Government of Rajasthan (as Chikitsa | GoR on Chikitsa-Raj). */
export function LoginLockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center justify-center gap-2 sm:gap-2.5 lg:justify-start", className)}>
      <AidsLockup />
      <span aria-hidden className="h-7 w-px shrink-0 bg-border sm:h-8" />
      <GovtRajasthanLogo variant="horizontal" className="shrink-0 text-foreground" />
    </div>
  );
}

/** "Developed by Vigorus AI | Managed by DoIT&C" (as on the SETU and Chikitsa-Raj logins). */
export function Attribution({ className }: { className?: string }) {
  const t = useTranslations("brand");
  const logoFirst = useLocale() === "hi";
  const credit = (label: string, mark: React.ReactNode) => (
    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">{logoFirst ? <>{mark}{label}</> : <>{label}{mark}</>}</span>
  );
  const plated = (src: string, alt: string, w: number, h: number) => (
    <span className="rounded dark:bg-white dark:px-1.5 dark:py-0.5">
      <Image src={src} alt={alt} width={w} height={h} loading="eager" className="h-3.5 w-auto" />
    </span>
  );
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground", className)}>
      <a
        href="https://vigorus.ai"
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t("developedBy")} Vigorus AI`}
        className="rounded-sm transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {credit(t("developedBy"), plated("/vigorus-ai.svg", "Vigorus AI", 1606, 290))}
      </a>
      <span aria-hidden className="h-3 w-px shrink-0 bg-border/70" />
      {credit(t("managedBy"), plated("/doit-rajasthan.svg", t("doit"), 614, 247))}
    </div>
  );
}

/** "© 2026 Rajasthan State AIDS Control Society. All rights reserved." */
export function CopyrightLine({ className }: { className?: string }) {
  const t = useTranslations("brand");
  return (
    <p className={cn("text-xs font-medium text-muted-foreground", className)}>
      &copy; {new Date().getFullYear()} {t("subtitle")}. {t("allRightsReserved")}.
    </p>
  );
}
