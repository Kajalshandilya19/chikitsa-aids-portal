"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { IconCircleCheckFilled as Check, IconLanguage as Languages } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  languageConfig,
  locales,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";

// hp_locale is a non-sensitive UI preference, so the client writes it directly
// (no BFF round-trip), then refreshes so server components re-render in the
// new locale via i18n/request.ts.
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("common");
  const router = useRouter();
  const active = useLocale() as Locale;

  const choose = (loc: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${loc};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax${location.protocol === "https:" ? ";secure" : ""}`;
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("language")}
          className={className}
        >
          <Languages className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        {locales.map((loc) => (
          <DropdownMenuItem
            key={loc}
            onClick={() => choose(loc)}
            className="flex items-center justify-between gap-3"
          >
            <span>{languageConfig[loc].nativeName}</span>
            <Check
              className={cn(
                "size-4 shrink-0 self-center text-primary",
                active === loc ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
