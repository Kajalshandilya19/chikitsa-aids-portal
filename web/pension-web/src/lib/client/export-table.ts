"use client";

import Papa from "papaparse";

import { saveBlob } from "@/lib/client/api";
import { guardFormula } from "@/lib/formula-guard";

/**
 * CSV / Excel download of rows the page already holds (the current page of a table).
 *
 * Only what is on screen is written, and screens only ever hold masked personal data (mobile and
 * email arrive masked from the services), so an export can never contain more than the table shows.
 * Every text cell passes the formula guard.
 */
export type ExportFormat = "csv" | "xlsx";
export type ExportCell = string | number | boolean | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => ExportCell;
}

const cellText = (v: ExportCell): string => (v === null || v === undefined ? "" : String(v));

export const fileStem = (title: string): string =>
  `${title
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "export"}-${new Date().toISOString().slice(0, 10)}`;

export async function exportRows<T>(format: ExportFormat, rows: readonly T[], columns: readonly ExportColumn<T>[], title: string): Promise<void> {
  const header = columns.map((c) => c.header);
  if (format === "csv") {
    const body = rows.map((r) => columns.map((c) => guardFormula(cellText(c.value(r)))));
    const csv = Papa.unparse([header, ...body]);
    // BOM so Excel opens UTF-8 (Hindi names) correctly.
    saveBlob(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), `${fileStem(title)}.csv`);
    return;
  }
  // Loaded on click only: exceljs is large and no page needs it until someone exports.
  const mod: unknown = await import("exceljs");
  const ExcelJS = ((mod as { default?: unknown }).default ?? mod) as typeof import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(header).font = { bold: true };
  for (const r of rows) {
    ws.addRow(
      columns.map((c) => {
        const v = c.value(r);
        // Numbers and booleans stay typed; every string is guarded and written as plain text.
        return typeof v === "number" || typeof v === "boolean" ? v : guardFormula(cellText(v));
      }),
    );
  }
  ws.columns.forEach((col, i) => {
    col.width = Math.min(48, Math.max(10, header[i]?.length ?? 10) + 2);
  });
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileStem(title)}.xlsx`);
}
