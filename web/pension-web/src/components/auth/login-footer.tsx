"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { CopyrightLine } from "@/components/brand";

/** Sign-in pages footer: copyright left, Privacy / Terms / Helpdesk right. A scrim keeps it readable over the skyline. */
export function LoginFooter() {
  const t = useTranslations("legal");
  const links = [
    { href: "/privacy", label: t("privacy.title") },
    { href: "/terms", label: t("terms.title") },
    { href: "/helpdesk", label: t("helpdesk.title") },
  ];
  return (
    <footer className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/70 to-transparent">
      <div className="flex flex-col items-center gap-1.5 px-6 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between lg:px-10">
        <CopyrightLine className="text-center sm:text-left" />
        <nav className="flex items-center gap-5">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="font-medium transition-colors hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
