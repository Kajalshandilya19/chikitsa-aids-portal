"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { IconCircleCheckFilled as CheckIcon, IconSelector as ChevronUpDownIcon, IconSearch as MagnifyingGlassIcon } from "@tabler/icons-react";

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  id?: string;
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder: string;
  /** Sheet title on phones. */
  title?: string;
  disabled?: boolean;
  /** Search box (phones always get one when there are more than 8 options). */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  invalid?: boolean;
}

/**
 * One select for every list on the form. Phones (< 640px) get a bottom drawer with big touch
 * targets and a search box; desktop gets a native-feeling Select for short lists and a searchable
 * popover for long ones (hospital lists run to a few hundred rows).
 */
export function ResponsiveSelect({ id, value, onValueChange, options, placeholder, title, disabled, searchable, searchPlaceholder, emptyText, className, invalid }: Props) {
  const c = useTranslations("common");
  const isPhone = !useMediaQuery("(min-width: 640px)");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => `${o.label} ${o.description ?? ""}`.toLowerCase().includes(s)) : options;
  }, [options, q]);
  // Same box as <Input>: border, focus ring and invalid ring come from the shared classes.
  const triggerCls = cn(
    "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-base font-normal transition-colors outline-none md:text-sm dark:bg-input/30",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
    "disabled:cursor-not-allowed disabled:bg-muted disabled:text-foreground/60",
    !selected && "text-muted-foreground",
    className,
  );

  if (isPhone) {
    return (
      <>
        <button id={id} type="button" disabled={disabled} className={triggerCls} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-invalid={invalid || undefined}>
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronUpDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
        <Drawer open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
          <DrawerContent className="max-h-[85svh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>{title ?? placeholder}</DrawerTitle>
              <DrawerDescription className="sr-only">{placeholder}</DrawerDescription>
            </DrawerHeader>
            {(searchable || options.length > 8) && (
              <div className="relative px-4 pb-2">
                <MagnifyingGlassIcon className="pointer-events-none absolute left-7 top-1/2 size-4 -translate-y-[60%] text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder ?? c("search")} className="h-10 pl-9" autoFocus />
              </div>
            )}
            <ul className="overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText ?? c("noMatch")}</li>}
              {filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    className={cn("flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm active:bg-accent", o.value === value && "bg-accent")}
                    onClick={() => { onValueChange(o.value); setOpen(false); setQ(""); }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.label}</span>
                      {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
                    </span>
                    {o.value === value && <CheckIcon className="size-4 shrink-0 text-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  if (searchable || options.length > 12) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button id={id} type="button" role="combobox" aria-expanded={open} disabled={disabled} className={triggerCls} aria-invalid={invalid || undefined}>
            <span className="truncate">{selected?.label ?? placeholder}</span>
            <ChevronUpDownIcon className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder ?? c("search")} />
            <CommandList>
              <CommandEmpty>{emptyText ?? c("noMatch")}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem key={o.value} value={`${o.label} ${o.description ?? ""}`} onSelect={() => { onValueChange(o.value); setOpen(false); }}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.description && <span className="block truncate text-xs text-muted-foreground">{o.description}</span>}
                    </span>
                    <CheckIcon className={cn("size-4 shrink-0 self-center text-primary", o.value === value ? "opacity-100" : "opacity-0")} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} aria-invalid={invalid || undefined} className={cn("h-10! w-full", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
