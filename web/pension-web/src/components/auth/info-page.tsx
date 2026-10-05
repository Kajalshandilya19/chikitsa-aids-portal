"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { IconCircleArrowLeftFilled } from "@tabler/icons-react";

import { LoginFooter } from "@/components/auth/login-footer";
import { Attribution, LoginLockup } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Public information pages linked from the sign-in footer (Privacy, Terms of Use, Helpdesk).
 * Text comes from `legal.<page>` in the message files: a title, an intro and sections of
 * { heading, body }. Every page carries a DRAFT notice until RSACS approves the wording
 * (docs/OPEN_QUESTIONS.md Q-24). No data is loaded here: these pages are static.
 */
export function InfoPage({ page }: { page: "privacy" | "terms" | "helpdesk" }) {
  const t = useTranslations("legal");
  const sections = t.raw(`${page}.sections`) as { heading: string; body: string }[];
  return (
    <div className="relative min-h-svh bg-background">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-1 text-foreground">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <main className="relative z-10 mx-auto flex min-h-svh max-w-3xl flex-col px-4 pb-24 pt-10 sm:px-6">
        <LoginLockup />
        <Link href="/login" className="mt-8 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <IconCircleArrowLeftFilled className="size-4" aria-hidden />
          {t("backToLogin")}
        </Link>
        <h1 className="font-display mt-4 text-3xl text-primary">{t(`${page}.title`)}</h1>
        <p className="mt-2 text-muted-foreground">{t(`${page}.intro`)}</p>
        <Alert className="mt-6">
          <AlertDescription>{t("draftNotice")}</AlertDescription>
        </Alert>
        <div className="mt-8 space-y-6">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-base font-semibold text-foreground">{s.heading}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </section>
          ))}
        </div>
        <div className="mt-12">
          <Attribution />
        </div>
      </main>
      <LoginFooter />
    </div>
  );
}
