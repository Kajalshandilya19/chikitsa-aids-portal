"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconHeartHandshake, IconMap2, IconUserFilled, IconUsersGroup, IconX } from "@tabler/icons-react";

interface PreviewSidebarProps {
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function PreviewSidebar({
  mobileOpen,
  onMobileOpenChange,
}: PreviewSidebarProps) {
  const pathname = usePathname();
  const t = useTranslations("preview");
  const beneficiariesActive = pathname.startsWith("/preview/beneficiaries");
  const centersActive = pathname.startsWith("/preview/centers");
  const usersActive = pathname.startsWith("/preview/users");

  return (
    <>
      {mobileOpen && (
        <button
          aria-label={t("closeMenu")}
          onClick={() => onMobileOpenChange(false)}
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#70102d] bg-[#881337] text-white shadow-xl transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[78px] items-center gap-3 border-b border-white/10 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/10">
            <IconHeartHandshake size={22} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide text-white">CHIKITSA</p>
            <p className="text-[11px] text-pink-100/70">{t("portal")}</p>
          </div>
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => onMobileOpenChange(false)}
            className="ml-auto rounded-lg p-1.5 text-pink-100/70 transition hover:bg-white/10 hover:text-white lg:hidden"
          >
            <IconX size={18} aria-hidden />
          </button>
        </div>

        <nav aria-label={t("navigation")} className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-pink-100/50">
            {t("modules")}
          </p>
          <Link
            href="/preview/beneficiaries"
            aria-current={beneficiariesActive ? "page" : undefined}
            onClick={() => onMobileOpenChange(false)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              beneficiariesActive
                ? "bg-[#C8102E] font-semibold text-white shadow-md shadow-black/10"
                : "text-pink-50/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <IconUsersGroup size={18} aria-hidden />
            <span>{t("beneficiaries")}</span>
          </Link>
          <Link
            href="/preview/centers"
            aria-current={centersActive ? "page" : undefined}
            onClick={() => onMobileOpenChange(false)}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              centersActive
                ? "bg-[#C8102E] font-semibold text-white shadow-md shadow-black/10"
                : "text-pink-50/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <IconMap2 size={18} aria-hidden />
            <span>{t("centers")}</span>
          </Link>
          <Link
            href="/preview/users"
            aria-current={usersActive ? "page" : undefined}
            onClick={() => onMobileOpenChange(false)}
            className={`mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
              usersActive
                ? "bg-[#C8102E] font-semibold text-white shadow-md shadow-black/10"
                : "text-pink-50/80 hover:bg-white/10 hover:text-white"
            }`}
          >
            <IconUserFilled size={18} aria-hidden />
            <span>{t("users")}</span>
          </Link>
        </nav>

        <div className="border-t border-white/10 bg-[#70102d]/50 px-5 py-4">
          <p className="text-xs font-semibold text-white">{t("demoTitle")}</p>
          <p className="mt-1 text-[10px] leading-4 text-pink-100/70">
            {t("demoNotice")}
          </p>
        </div>
      </aside>
    </>
  );
}
