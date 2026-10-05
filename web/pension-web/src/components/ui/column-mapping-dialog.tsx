"use client";

/**
 * Column mapping step of the bulk upload: shows each system column next to a
 * searchable picker of the file's columns, pre-filled by `autoMatchColumns`.
 */

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconCircleCheckFilled,
  IconSelector,
} from "@tabler/icons-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BulkUploadColumn } from "@/components/ui/bulk-upload-sheet";

export interface ColumnMapping {
  systemColumn: BulkUploadColumn;
  /** Index into the file's columns; -1 = unmapped. */
  fileColumnIndex: number;
  matchType: "exact" | "fuzzy" | "none";
}

/* ------------------------------------------------------------------ */
/*  Auto-match scoring                                                 */
/* ------------------------------------------------------------------ */

/** Extra header spellings per column key, e.g. `{ mobile: ["phone", "contact no"] }`. */
export type ColumnSynonyms = Readonly<Record<string, readonly string[]>>;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[_\-\s.]+/g, "");
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreMatch(col: BulkUploadColumn, header: string, synonyms: ColumnSynonyms): number {
  const headerLower = header.toLowerCase().trim();
  const keyLower = col.key.toLowerCase();
  const labelLower = col.label.toLowerCase().trim();

  if (!headerLower) return 0;
  if (headerLower === keyLower || headerLower === labelLower) return 100;

  const headerNorm = normalize(header);
  const keyNorm = normalize(col.key);
  const labelNorm = normalize(col.label);
  if (headerNorm === keyNorm || (labelNorm && headerNorm === labelNorm)) return 90;

  for (const syn of synonyms[col.key] ?? []) {
    if (headerLower === syn.toLowerCase() || headerNorm === normalize(syn)) return 70;
  }

  if (headerNorm.length >= 3 && keyNorm.length >= 3) {
    if (headerNorm.includes(keyNorm) || keyNorm.includes(headerNorm)) {
      const ratio =
        Math.min(headerNorm.length, keyNorm.length) / Math.max(headerNorm.length, keyNorm.length);
      return Math.round(40 + ratio * 20);
    }
    if (labelNorm && (headerNorm.includes(labelNorm) || labelNorm.includes(headerNorm))) {
      const ratio =
        Math.min(headerNorm.length, labelNorm.length) / Math.max(headerNorm.length, labelNorm.length);
      return Math.round(40 + ratio * 20);
    }
  }

  const headerTokens = tokenize(header);
  const allSystemTokens = new Set([...tokenize(col.key), ...tokenize(col.label)]);
  const shared = headerTokens.filter((tok) => allSystemTokens.has(tok)).length;
  if (shared > 0) {
    const maxTokens = Math.max(headerTokens.length, allSystemTokens.size);
    return Math.round((shared / maxTokens) * 50);
  }

  return 0;
}

/**
 * Match file headers to system columns: best scores first, each file column
 * used at most once, scores below 40 ignored. A label or key equal to the
 * header (ignoring case) is an "exact" match.
 */
export function autoMatchColumns(
  fileHeaders: readonly string[],
  systemColumns: readonly BulkUploadColumn[],
  synonyms: ColumnSynonyms = {},
): ColumnMapping[] {
  const scores = systemColumns.map((col) =>
    fileHeaders.map((header) => scoreMatch(col, header, synonyms)),
  );

  const pairs: { sysIdx: number; fileIdx: number; score: number }[] = [];
  for (let si = 0; si < systemColumns.length; si++) {
    for (let fi = 0; fi < fileHeaders.length; fi++) {
      if (scores[si][fi] >= 40) pairs.push({ sysIdx: si, fileIdx: fi, score: scores[si][fi] });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const assignments: (number | null)[] = new Array<number | null>(systemColumns.length).fill(null);
  const assignedSys = new Set<number>();
  const claimed = new Set<number>();
  for (const { sysIdx, fileIdx } of pairs) {
    if (assignedSys.has(sysIdx) || claimed.has(fileIdx)) continue;
    assignments[sysIdx] = fileIdx;
    assignedSys.add(sysIdx);
    claimed.add(fileIdx);
  }

  return systemColumns.map((col, idx): ColumnMapping => {
    const fileIdx = assignments[idx];
    if (fileIdx === null || fileIdx === undefined) {
      return { systemColumn: col, fileColumnIndex: -1, matchType: "none" };
    }
    return {
      systemColumn: col,
      fileColumnIndex: fileIdx,
      matchType: scores[idx][fileIdx] >= 100 ? "exact" : "fuzzy",
    };
  });
}

/* ------------------------------------------------------------------ */
/*  Searchable file-column picker                                      */
/* ------------------------------------------------------------------ */

function FileColumnPicker({
  fileHeaders,
  value,
  onChange,
  invalid,
}: {
  fileHeaders: readonly string[];
  value: number;
  onChange: (idx: number) => void;
  invalid?: boolean;
}) {
  const t = useTranslations("columnMapping");
  const [open, setOpen] = React.useState(false);
  const selected = value >= 0 ? fileHeaders[value] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-8 w-full justify-between text-xs font-normal",
            !selected && "text-muted-foreground border-dashed",
          )}
        >
          <span className="truncate">{selected ?? t("selectColumn")}</span>
          <IconSelector className="ml-1.5 size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder={t("searchColumns")} className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty>{t("noColumnFound")}</CommandEmpty>
            <CommandGroup className="max-h-[200px] overflow-y-auto">
              <CommandItem
                value="__none__"
                onSelect={() => {
                  onChange(-1);
                  setOpen(false);
                }}
              >
                <IconCircleCheckFilled
                  className={cn("text-primary size-3", value < 0 ? "opacity-100" : "opacity-0")}
                />
                <span className="text-muted-foreground">{t("none")}</span>
              </CommandItem>
              {fileHeaders.map((header, fi) => (
                <CommandItem
                  key={fi}
                  value={`${fi}:${header}`}
                  keywords={[header]}
                  onSelect={() => {
                    onChange(fi);
                    setOpen(false);
                  }}
                >
                  <IconCircleCheckFilled
                    className={cn("text-primary size-3", value === fi ? "opacity-100" : "opacity-0")}
                  />
                  {header}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Column Mapping Sheet                                               */
/* ------------------------------------------------------------------ */

interface ColumnMappingDialogProps {
  open: boolean;
  fileHeaders: readonly string[];
  /** Data rows of the file (header excluded); the first non-empty value is shown as an example. */
  parsedRows: ReadonlyArray<readonly string[]>;
  mappings: ColumnMapping[];
  onMappingsChange: (mappings: ColumnMapping[]) => void;
  onConfirm: () => void;
  onBack: () => void;
  onOpenChange?: (open: boolean) => void;
  isBusy?: boolean;
}

export function ColumnMappingDialog({
  open,
  fileHeaders,
  parsedRows,
  mappings,
  onMappingsChange,
  onConfirm,
  onBack,
  onOpenChange,
  isBusy = false,
}: ColumnMappingDialogProps) {
  const t = useTranslations("columnMapping");
  const matchedCount = mappings.filter((m) => m.fileColumnIndex >= 0).length;
  const totalCount = mappings.length;
  const requiredUnmapped = mappings.filter(
    (m) => m.systemColumn.required && m.fileColumnIndex < 0,
  ).length;

  // One example value per file column (first non-empty in the first 50 rows)
  const examples = React.useMemo(() => {
    const out: string[] = [];
    const sample = parsedRows.slice(0, 50);
    for (let fi = 0; fi < fileHeaders.length; fi++) {
      const hit = sample.find((r) => (r[fi] ?? "").trim() !== "");
      out[fi] = hit ? (hit[fi] ?? "").trim() : "";
    }
    return out;
  }, [parsedRows, fileHeaders]);

  const handleMappingChange = (systemIdx: number, fileIdx: number) => {
    const updated = [...mappings];
    updated[systemIdx] = {
      ...updated[systemIdx],
      fileColumnIndex: fileIdx,
      matchType: fileIdx >= 0 ? "fuzzy" : "none",
    };
    onMappingsChange(updated);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onOpenChange?.(false);
      }}
    >
      <SheetContent className="flex flex-col gap-0 p-0 data-[side=right]:w-full sm:max-w-[560px]">
        <SheetHeader className="shrink-0 border-b px-5 pt-5 pb-3">
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description", { matched: matchedCount, total: totalCount })}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="divide-y">
            {mappings.map((mapping, sysIdx) => {
              const { systemColumn, fileColumnIndex } = mapping;
              const example = fileColumnIndex >= 0 ? examples[fileColumnIndex] : "";
              const missing = !!systemColumn.required && fileColumnIndex < 0;

              return (
                <div key={systemColumn.key} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-[180px] shrink-0 pt-1.5">
                    <span className="text-sm leading-none font-medium">{systemColumn.label}</span>
                    {systemColumn.required && (
                      <span className="text-destructive ml-0.5 text-xs" aria-hidden>
                        *
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <FileColumnPicker
                      fileHeaders={fileHeaders}
                      value={fileColumnIndex}
                      invalid={missing}
                      onChange={(fi) => handleMappingChange(sysIdx, fi)}
                    />
                    {example && (
                      <p className="text-muted-foreground mt-1 truncate text-xs">
                        {t("example", { value: example })}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-background flex shrink-0 flex-col gap-2 border-t px-5 py-3">
          {requiredUnmapped > 0 && (
            <p className="text-destructive flex items-center gap-1.5 text-xs">
              <IconAlertTriangle className="size-3.5 shrink-0" />
              {t("requiredUnmapped", { count: requiredUnmapped })}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onBack} disabled={isBusy}>
              <IconArrowLeft />
              {t("back")}
            </Button>
            <Button type="button" size="sm" onClick={onConfirm} disabled={isBusy}>
              {t("continue")}
              <IconArrowRight />
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
