"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronDown, IconChevronRight, IconExchangeFilled, IconHomeFilled } from "@tabler/icons-react";

import { SwitchAssignmentDialog } from "@/components/dashboard/switch-assignment-dialog";
import { LanguageSwitcher } from "@/components/language-switcher";
import { TextSizeControl } from "@/components/text-size-control";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { breadcrumbsFor, type Crumb } from "@/config/nav";
import type { Me } from "@/lib/api-types";
import { useBreadcrumbLabel } from "@/providers/breadcrumb-provider";
import { useSession } from "@/providers/session-provider";

/** Role name and place of the active assignment, in the active language. */
export function useScopeText(user: Me): { role: string; place: string } {
  const t = useTranslations("workspace");
  const hi = useLocale() === "hi";
  const pick = (p: { name_en: string; name_hi: string | null }) => (hi && p.name_hi ? p.name_hi : p.name_en);
  const role = user.role ? pick(user.role) : "";
  const place = user.center ? `${user.center.code} ${pick(user.center)}` : user.district ? pick(user.district) : t("scope.STATE");
  return { role, place };
}

/**
 * The Chikitsa-Raj app bar: sidebar trigger; on phones a Home button plus the current page, with the
 * full path in a popover; on large screens the inline trail. Right: switch assignment (sm and up; the
 * account menu in the sidebar has it too), text size, language, theme.
 */
export function DashboardHeader() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const dynamicLabel = useBreadcrumbLabel();

  let breadcrumbs: Crumb[] = breadcrumbsFor(pathname, t);
  // A detail page may override its final crumb's text (e.g. the beneficiary on an application).
  if (dynamicLabel && breadcrumbs.length > 1) {
    const n = breadcrumbs.length;
    breadcrumbs = breadcrumbs.map((c, i) => (i === n - 1 ? { ...c, label: Array.isArray(dynamicLabel) ? dynamicLabel.join(" ") : dynamicLabel } : c));
  }

  const current = breadcrumbs[breadcrumbs.length - 1]!;
  const hasTrail = breadcrumbs.length > 1;

  return (
    <header className="sticky top-0 z-30 flex min-h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1" />
      <nav aria-label={t("breadcrumb")} className="flex w-full items-center justify-between gap-2">
        {/* Mobile: a Home button + current page name; the full path lives in a
            popover. On lg+ the full trail renders inline (below). */}
        <div className="flex min-w-0 items-center gap-0.5">
          <div className="flex items-center gap-0.5 lg:hidden">
            <Button asChild variant="ghost" size="icon" className="size-8 shrink-0">
              <Link href="/dashboard" aria-label={t("items.dashboard")}>
                <IconHomeFilled className="size-4" />
              </Link>
            </Button>

            {hasTrail && (
              <>
                <IconChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 min-w-0 gap-1 px-2 font-medium">
                      <span className="truncate">{current.label}</span>
                      <IconChevronDown className="size-3.5 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={6} className="w-auto max-w-[18rem] min-w-[13rem] p-1">
                    {breadcrumbs.map((crumb, i) => {
                      const isLast = i === breadcrumbs.length - 1;
                      const body = (
                        <>
                          {i === 0 ? <IconHomeFilled className="size-4 shrink-0 opacity-70" /> : <IconChevronRight className="size-4 shrink-0 opacity-40" />}
                          <span className="break-words">{crumb.label}</span>
                        </>
                      );
                      return crumb.href && !isLast ? (
                        <Link
                          key={i}
                          href={crumb.href}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {body}
                        </Link>
                      ) : (
                        <span key={i} className="flex items-center gap-2 rounded-md bg-accent/60 px-2 py-1.5 text-sm font-medium text-foreground">
                          {body}
                        </span>
                      );
                    })}
                  </PopoverContent>
                </Popover>
              </>
            )}
          </div>

          {/* Large screens: a compact inline trail. The Dashboard root is an
              icon only (no label), and intermediate crumbs truncate, so the
              breadcrumb stays narrow. */}
          <ol className="hidden min-w-0 items-center gap-0.5 lg:flex">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              const isHome = i === 0;
              // Home › … › parent › current: with four or more levels the middle ones collapse to an ellipsis.
              const collapsed = breadcrumbs.length > 3 && i > 0 && i < breadcrumbs.length - 2;
              if (collapsed)
                return i === 1 ? (
                  <li key="ellipsis" className="flex items-center gap-0.5">
                    <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                    <span
                      className="px-1 text-sm text-muted-foreground"
                      title={breadcrumbs
                        .slice(1, breadcrumbs.length - 2)
                        .map((c) => c.label)
                        .join(" › ")}
                    >
                      …
                    </span>
                  </li>
                ) : null;
              return (
                <li key={i} className="flex min-w-0 items-center gap-0.5">
                  {i > 0 && <IconChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      aria-label={isHome ? crumb.label : undefined}
                      className="flex max-w-[10rem] items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {isHome ? <IconHomeFilled className="size-4 shrink-0" /> : <span className="truncate">{crumb.label}</span>}
                    </Link>
                  ) : (
                    <span className="flex max-w-[14rem] items-center gap-1.5 px-1.5 py-1 text-sm font-medium text-foreground">
                      {isHome ? <IconHomeFilled className="size-4 shrink-0" aria-label={crumb.label} /> : <span className="truncate">{crumb.label}</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Hidden on phones: the header cannot hold it next to a breadcrumb; the account menu has it. */}
          <div className="hidden sm:block">
            <SwitchAssignmentButton />
          </div>
          <TextSizeControl />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}

function SwitchAssignmentButton() {
  const t = useTranslations("workspace");
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  if (user.assignment_count < 2) return null;
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label={t("switch")} title={t("switch")}>
        <IconExchangeFilled className="size-4" />
      </Button>
      <SwitchAssignmentDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
