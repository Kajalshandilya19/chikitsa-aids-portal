"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { IconMinus as MinusIcon, IconPlus as PlusIcon, IconTextSize as TextSizeIcon } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const SIZES = [90, 100, 112, 125] as const;
const COOKIE = "hp_text";

const read = (): number => {
  const m = document.cookie.match(/(?:^|; )hp_text=(\d+)/);
  const v = m ? Number(m[1]) : 100;
  return (SIZES as readonly number[]).includes(v) ? v : 100;
};

const apply = (v: number) => {
  document.documentElement.style.fontSize = v === 100 ? "" : `${v}%`;
  document.cookie = `${COOKIE}=${v}; path=/; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
};

/**
 * Government-site text sizing behind one icon button, like the language and theme menus.
 * Scales the root font size, so every rem-based size (text, spacing, controls) grows together;
 * the choice persists in a cookie and is applied on the server before first paint.
 */
export function TextSizeControl({ className }: { className?: string }) {
  const t = useTranslations("common.textSize");
  const [size, setSize] = useState(100);
  useEffect(() => setSize(read()), []);
  const idx = SIZES.indexOf(size as (typeof SIZES)[number]);
  const set = (v: number) => {
    setSize(v);
    apply(v);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("label")} className={cn("relative", className)}>
          <TextSizeIcon className="size-[18px]" />
          {size !== 100 && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">{t("label")}</span>
          <span className="text-xs font-semibold text-muted-foreground tabular-nums">{size}%</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label={t("smaller")} disabled={idx <= 0} onClick={() => set(SIZES[Math.max(0, idx - 1)]!)}>
            <MinusIcon className="size-4" />
          </Button>
          <div className="flex flex-1 items-end justify-between px-1">
            {SIZES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set(s)}
                aria-label={`${s}%`}
                aria-pressed={s === size}
                className={cn("grid size-8 place-items-center rounded-md font-semibold transition-colors", s === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground")}
                style={{ fontSize: `${(s / 100) * 0.8125}rem` }}
              >
                A
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" className="size-9 shrink-0" aria-label={t("larger")} disabled={idx >= SIZES.length - 1} onClick={() => set(SIZES[Math.min(SIZES.length - 1, idx + 1)]!)}>
            <PlusIcon className="size-4" />
          </Button>
        </div>
        {size !== 100 && (
          <Button variant="ghost" size="sm" className="mt-2 h-8 w-full text-xs" onClick={() => set(100)}>
            {t("reset")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
