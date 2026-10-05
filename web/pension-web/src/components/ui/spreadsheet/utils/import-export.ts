/**
 * Import/Export Utilities
 * CSV (papaparse), XLSX (exceljs, loaded on demand) and JSON import/export
 * for spreadsheet data.
 *
 * Every CSV or XLSX this module writes for PEOPLE goes through `guardFormula`,
 * so a cell value can never turn into a live formula when the file is opened in
 * a spreadsheet app (OWASP "CSV injection"). The file rebuilt for upload to our
 * own data-service is written unguarded (`guard: false`): the service stores a
 * leading = + - @ as text, and a guard quote would change the value.
 */

import Papa from "papaparse";

import { guardFormula } from "@/lib/formula-guard";

import type { CellData, CellType } from "../types";
import { cellValueToString } from "./formatters";

export const CSV_MIME = "text/csv";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ExportOptions {
  includeHeaders?: boolean;
  headerRow?: number;
  delimiter?: string;
}

export interface ImportOptions {
  hasHeaders?: boolean;
  delimiter?: string;
  columnTypes?: Record<number, CellType>;
}

export { guardFormula };

const cellText = (cell: CellData | undefined): string =>
  cell?.displayValue ?? cellValueToString(cell?.value);

/**
 * Build CSV text from a header row and data rows. Every value (headers too)
 * passes through `guardFormula` unless `guard` is false; quoting is done by papaparse.
 * @param bom - prefix a UTF-8 BOM so Excel opens Hindi text correctly (use for
 *   files meant for people, not for files sent to the server)
 * @param guard - false only for the file rebuilt for upload to the data-service
 */
export function rowsToCSV(
  headers: readonly string[] | null,
  rows: ReadonlyArray<readonly string[]>,
  { bom = false, delimiter = ",", guard = true }: { bom?: boolean; delimiter?: string; guard?: boolean } = {},
): string {
  const g = guard ? guardFormula : (v: string) => v;
  const data = rows.map((row) => row.map((v) => g(v)));
  const csv = Papa.unparse(
    headers ? { fields: headers.map((h) => g(h)), data } : data,
    { delimiter, newline: "\r\n" },
  );
  return bom ? `\uFEFF${csv}` : csv;
}

/**
 * Export spreadsheet data to CSV format (display values, formula guarded).
 */
export function exportToCSV(data: CellData[][], options: ExportOptions = {}): string {
  const { delimiter = "," } = options;
  return rowsToCSV(
    null,
    data.map((row) => row.map((cell) => cellText(cell))),
    { delimiter },
  );
}

/**
 * Parse CSV string to 2D array
 * Uses PapaParse for reliable, high-performance parsing of large files
 */
export function parseCSV(csv: string, delimiter = ","): string[][] {
  const result = Papa.parse<string[]>(csv, {
    delimiter,
    header: false,
    skipEmptyLines: "greedy",
  });
  return result.data;
}

/**
 * Parse a CSV file to a 2D string array (empty lines skipped, BOM removed).
 * @param maxRows - stop reading after this many lines (the caller can detect
 *   "too many rows" by asking for one more than it allows)
 */
export function parseCSVFile(file: File, maxRows?: number): Promise<string[][]> {
  return new Promise<string[][]>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: "greedy",
      preview: maxRows ?? 0,
      complete: (results) => {
        const rows = results.data.map((row) =>
          Array.isArray(row) ? row.map((cell) => (cell == null ? "" : String(cell))) : [],
        );
        if (rows[0]?.[0]?.startsWith("﻿")) {
          rows[0][0] = rows[0][0].slice(1);
        }
        resolve(rows);
      },
      error: (error: Error) => reject(error),
    });
  });
}

/**
 * Import CSV to spreadsheet data format
 */
export function importFromCSV(
  csv: string,
  options: ImportOptions = {},
): { data: CellData[][]; headers?: string[] } {
  const { hasHeaders = false, delimiter = ",", columnTypes = {} } = options;

  const parsed = parseCSV(csv, delimiter);

  if (parsed.length === 0) {
    return { data: [] };
  }

  let headers: string[] | undefined;
  let dataRows = parsed;

  if (hasHeaders && parsed.length > 0) {
    headers = parsed[0];
    dataRows = parsed.slice(1);
  }

  const data: CellData[][] = dataRows.map((row) =>
    row.map((value, colIndex) => {
      const type = columnTypes[colIndex] || "text";
      return {
        value: parseValue(value, type),
        displayValue: value,
        type,
      };
    }),
  );

  return { data, headers };
}

/**
 * Export spreadsheet data to JSON format
 */
export function exportToJSON(data: CellData[][], headers?: string[]): string {
  if (headers && headers.length > 0) {
    const objects = data.map((row) => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        obj[header] = row[index]?.value ?? null;
      });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  const values = data.map((row) => row.map((cell) => cell?.value ?? null));
  return JSON.stringify(values, null, 2);
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Import JSON to spreadsheet data format
 */
export function importFromJSON(
  json: string,
  columnTypes: Record<string, CellType> = {},
): { data: CellData[][]; headers?: string[] } {
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid JSON format: expected array");
  }
  if (parsed.length === 0) {
    return { data: [] };
  }

  const first: unknown = parsed[0];
  if (isPlainObject(first)) {
    // Array of objects: headers come from the first object's keys
    const headers = Object.keys(first);
    const data: CellData[][] = parsed.map((item: unknown) => {
      const obj = isPlainObject(item) ? item : {};
      return headers.map((header) => {
        const value = obj[header];
        const type = columnTypes[header] || inferType(value);
        return { value, displayValue: formatValue(value, type), type };
      });
    });
    return { data, headers };
  }

  // Array of arrays
  const data: CellData[][] = parsed.map((row: unknown) =>
    (Array.isArray(row) ? (row as unknown[]) : [row]).map((value) => {
      const type = inferType(value);
      return { value, displayValue: formatValue(value, type), type };
    }),
  );
  return { data };
}

/**
 * Parse string value to appropriate type
 */
function parseValue(value: string, type: CellType): unknown {
  if (value === "") {
    return null;
  }

  switch (type) {
    case "number":
    case "currency":
    case "percentage": {
      const num = Number(value.replace(/[,$%₹]/g, ""));
      return Number.isNaN(num) ? value : num;
    }
    case "boolean":
      return (
        value.toLowerCase() === "true" || value.toLowerCase() === "yes" || value === "1"
      );
    default:
      return value;
  }
}

/**
 * Infer cell type from value
 */
function inferType(value: unknown): CellType {
  if (value === null || value === undefined) return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return "date";
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return "date";
    if (/^-?\d+\.?\d*$/.test(value)) return "number";
  }
  return "text";
}

/**
 * Format value for display
 */
function formatValue(value: unknown, type: CellType): string {
  if (value === null || value === undefined) return "";
  if (type === "boolean") return value ? "true" : "false";
  return cellValueToString(value);
}

/**
 * Trigger a browser download of text or a Blob (a user action, never storage).
 */
export function downloadFile(
  content: string | Blob,
  filename: string,
  mimeType: string = CSV_MIME,
): void {
  const blob = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Read file content as text
 */
export function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// XLSX via exceljs (loaded on demand: it is large and most pages never need it)
// ---------------------------------------------------------------------------

type ExcelJSModule = typeof import("exceljs");

async function loadExcelJS(): Promise<ExcelJSModule> {
  // exceljs is CommonJS; depending on the bundler's interop the namespace is
  // the module itself or wraps it in `default`. Resolve at runtime.
  const mod: unknown = await import("exceljs");
  return ((mod as { default?: unknown }).default ?? mod) as ExcelJSModule;
}

/** YYYY-MM-DD for an exceljs date (exceljs builds dates in UTC). */
const excelDateToIso = (d: Date): string =>
  Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);

/**
 * Display string for an exceljs cell value: formulas give their cached
 * result, dates give YYYY-MM-DD, rich text and hyperlinks give their text.
 */
export function excelCellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return excelDateToIso(value);
  if (typeof value !== "object") return "";

  const v = value as Record<string, unknown>;
  if ("formula" in v || "sharedFormula" in v) return excelCellToString(v.result);
  if (Array.isArray(v.richText)) {
    return v.richText
      .map((part: unknown) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { text: unknown }).text ?? "")
          : "",
      )
      .join("");
  }
  if ("hyperlink" in v || "text" in v) return excelCellToString(v.text);
  if (typeof v.error === "string") return v.error;
  return "";
}

/**
 * Parse an .xlsx file to a 2D string array (first worksheet only, blank rows
 * skipped, every cell as its display string). Rows are not padded: a missing
 * trailing cell reads as undefined.
 */
export async function parseXLSX(file: File): Promise<string[][]> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  // The typings say Node Buffer; the browser build accepts an ArrayBuffer.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const out: string[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      out[colNumber - 1] = excelCellToString(cell.value);
    });
    for (let i = 0; i < out.length; i++) {
      if (out[i] === undefined) out[i] = "";
    }
    if (out.some((v) => v.trim() !== "")) rows.push(out);
  });
  return rows;
}

/**
 * Build an .xlsx Blob (one worksheet) from a header row and data rows. Every
 * cell is written as a plain string (never a formula), after `guardFormula`
 * unless `guard` is false (the file rebuilt for upload to the data-service).
 */
export async function rowsToXLSXBlob(
  headers: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
  sheetName = "Sheet1",
  { guard = true }: { guard?: boolean } = {},
): Promise<Blob> {
  const g = guard ? guardFormula : (v: string) => v;
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(
    sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet1",
  );
  sheet.addRow(headers.map((h) => g(h)));
  for (const row of rows) {
    sheet.addRow(row.map((v) => g(v)));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}
