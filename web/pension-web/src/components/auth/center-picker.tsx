"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { IconChevronDown, IconCircleCheckFilled } from "@tabler/icons-react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { LoginCenter } from "@/lib/api-types";
import { api } from "@/lib/client/api";
import { cn } from "@/lib/utils";

/** Rows mounted at once; beyond this the user is searching, not scrolling. */
const RENDER_LIMIT = 80;

/**
 * The Center picker of the Center login: a searchable list of ACTIVE Centers (code, name, district,
 * from the public `/api/auth/centers`), instead of typing the code. The value is the Center code,
 * exactly what the login API takes. Matching runs here over code, name and district, in English and
 * Hindi, so "rj001", "ajmer" and "अजमेर" all find RJ001.
 */
export function CenterPicker({ value, onChange, invalid, id }: { value: string; onChange: (code: string) => void; invalid?: boolean; id?: string }) {
  const t = useTranslations("auth");
  const hi = useLocale() === "hi";
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data, isError, isLoading } = useQuery({
    queryKey: ["login-centers"],
    queryFn: () => api.get<LoginCenter[]>("/api/auth/centers"),
    staleTime: 5 * 60_000,
  });

  const name = (c: LoginCenter) => (hi && c.name_hi ? c.name_hi : c.name_en);
  const district = (c: LoginCenter) => (hi && c.district_hi ? c.district_hi : c.district_en) ?? "";
  const selected = data?.find((c) => c.code === value) ?? null;

  const matches = useMemo(() => {
    const all = data ?? [];
    const needle = q.trim().toLowerCase();
    const hit = needle
      ? all.filter((c) => [c.code, c.name_en, c.name_hi ?? "", c.district_en ?? "", c.district_hi ?? ""].some((s) => s.toLowerCase().includes(needle)))
      : all;
    return hit.slice(0, RENDER_LIMIT);
  }, [data, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            // The same box as <Input className="h-11">: border, radius, padding, text size, focus ring.
            "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base transition-colors outline-none md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          )}
        >
          {selected ? (
            <span className="min-w-0 truncate text-foreground">
              {selected.code} · {name(selected)}
            </span>
          ) : (
            <span className="min-w-0 truncate text-muted-foreground">{isError ? t("centerLoadFailed") : t("centerPick")}</span>
          )}
          <IconChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={t("centerSearch")} />
          <CommandList className="max-h-72">
            {!isLoading && <CommandEmpty>{t("centerNone")}</CommandEmpty>}
            <CommandGroup>
              {matches.map((c) => (
                <CommandItem
                  key={c.code}
                  value={c.code}
                  onSelect={() => {
                    onChange(c.code);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex items-center gap-2"
                >
                  <IconCircleCheckFilled className={cn("size-4 shrink-0 self-center text-primary", c.code === value ? "opacity-100" : "opacity-0")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate">
                      <span className="font-semibold">{c.code}</span> · {name(c)}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{district(c)}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
