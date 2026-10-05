"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IconDownload, IconFileSpreadsheet, IconFileText } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { exportRows, type ExportColumn, type ExportFormat } from "@/lib/client/export-table";

/**
 * "Download" menu for the CURRENT PAGE of a table (CSV or Excel). Masked values only: pass the
 * same fields the table shows, never anything fetched just for the export.
 */
export function TableExportMenu<T>({ rows, columns, title, disabled }: { rows: readonly T[]; columns: readonly ExportColumn<T>[]; title: string; disabled?: boolean }) {
  const t = useTranslations("dataTable");
  const [busy, setBusy] = useState(false);
  const run = async (format: ExportFormat) => {
    setBusy(true);
    try {
      await exportRows(format, rows, columns, title);
    } catch {
      toast.error(t("exportFailed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" aria-label={t("download")} title={t("download")} disabled={disabled || busy || rows.length === 0}>
          {busy ? <Spinner /> : <IconDownload className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run("csv")} className="gap-2">
          <IconFileText className="size-4" />
          {t("downloadCsv")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("xlsx")} className="gap-2">
          <IconFileSpreadsheet className="size-4" />
          {t("downloadExcel")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
