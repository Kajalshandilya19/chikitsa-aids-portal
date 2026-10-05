"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconLockFilled } from "@tabler/icons-react";

import { navItemFor, navVisible } from "@/config/nav";
import { useSession } from "@/providers/session-provider";

/**
 * A page whose nav item the active role cannot see shows a 403 panel instead of the page (someone
 * typed the URL, or the role was switched). UX only: the services refuse the data anyway.
 */
export function NavAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useSession();
  const item = navItemFor(pathname);
  if (!item || navVisible(item, user.permissions)) return <>{children}</>;
  return <Forbidden />;
}

export function Forbidden() {
  const t = useTranslations("errors");
  return (
    <div className="flex min-h-[50svh] flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-destructive/10">
        <IconLockFilled className="size-7 text-destructive" aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">{t("forbiddenTitle")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("forbiddenText")}</p>
    </div>
  );
}
