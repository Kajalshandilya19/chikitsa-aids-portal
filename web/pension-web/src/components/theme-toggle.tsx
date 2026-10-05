"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/providers/theme-provider";
import { useTranslations } from "next-intl";
import { IconCircleCheckFilled as Check, IconDeviceDesktopFilled as Monitor, IconMoonFilled as Moon, IconSunFilled as Sun } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", icon: Sun, labelKey: "light" },
  { value: "dark", icon: Moon, labelKey: "dark" },
  { value: "system", icon: Monitor, labelKey: "system" },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("theme")}
          className={className}
        >
          {/* Avoid hydration mismatch: render a stable icon until mounted. */}
          <Sun className="size-4 scale-100 dark:scale-0 dark:-rotate-90 transition-all" />
          <Moon className="absolute size-4 scale-0 dark:scale-100 dark:rotate-0 transition-all" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {OPTIONS.map(({ value, icon: Icon, labelKey }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => {
              setTheme(value);
            }}
            className="flex items-center gap-2"
          >
            <Icon className="size-4" />
            <span className="flex-1">{t(labelKey)}</span>
            <Check
              className={cn(
                "size-4 shrink-0 self-center text-primary",
                mounted && theme === value ? "opacity-100" : "opacity-0",
              )}
            />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
