/**
 * Cell Value Formatters and Parsers
 * Handles formatting cell values for display and parsing input values.
 *
 * Parsers never drop what the user typed: input that does not parse as the
 * column type is kept as the raw (trimmed) string so validation can flag it
 * instead of silently blanking the cell.
 */

import type { CellType, FormatOptions } from "../types";

const DEFAULT_OPTIONS: FormatOptions = {
  locale: "en-IN",
  currency: "INR",
  dateFormat: "yyyy-MM-dd",
  decimalPlaces: 2,
};

/** YYYY-MM-DD from a Date using its local calendar day. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Plain string form of a cell value, as written to an exported or rebuilt
 * file: dates as YYYY-MM-DD, booleans as true/false, numbers unformatted.
 */
export function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toIsoDate(value);
  }
  return String(value);
}

/**
 * Format a cell value based on its type
 * @param value - Raw cell value
 * @param type - Cell type
 * @param options - Formatting options
 * @returns Formatted display string
 */
export function formatCellValue(
  value: unknown,
  type: CellType,
  options: FormatOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (value === null || value === undefined || value === "") {
    return "";
  }

  switch (type) {
    case "text":
      return formatText(value);
    case "number":
      return formatNumber(value, opts);
    case "date":
      return formatDate(value);
    case "currency":
      return formatCurrency(value, opts);
    case "percentage":
      return formatPercentage(value, opts);
    case "boolean":
      return formatBoolean(value);
    case "dropdown":
    case "multi-dropdown":
      return formatText(value);
    default:
      return String(value);
  }
}

/**
 * Parse an input string to the appropriate type
 * @param input - Input string from user
 * @param type - Target cell type
 * @returns Parsed value (the trimmed input when it does not parse)
 */
export function parseInputValue(input: string, type: CellType): unknown {
  const trimmed = input.trim();

  if (trimmed === "") {
    return null;
  }

  switch (type) {
    case "number":
      return parseNumber(trimmed);
    case "date":
      return parseDate(trimmed);
    case "currency":
      return parseCurrency(trimmed);
    case "percentage":
      return parsePercentage(trimmed);
    case "boolean":
      return parseBoolean(trimmed);
    default:
      return trimmed;
  }
}

// Individual formatters

function formatText(value: unknown): string {
  return String(value);
}

function formatNumber(value: unknown, opts: FormatOptions): string {
  const num = typeof value === "number" ? value : Number(value);
  if (typeof value !== "number" || Number.isNaN(num)) {
    return String(value);
  }

  return new Intl.NumberFormat(opts.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: opts.decimalPlaces,
  }).format(num);
}

function formatDate(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : toIsoDate(value);
  }
  // Dates are kept as the string the user (or the file) gave, normally YYYY-MM-DD.
  return String(value);
}

function formatCurrency(value: unknown, opts: FormatOptions): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return String(value);
  }

  return new Intl.NumberFormat(opts.locale, {
    style: "currency",
    currency: opts.currency,
    minimumFractionDigits: opts.decimalPlaces,
    maximumFractionDigits: opts.decimalPlaces,
  }).format(value);
}

function formatPercentage(value: unknown, opts: FormatOptions): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return String(value);
  }

  // Value is stored as decimal (0.5 = 50%)
  return new Intl.NumberFormat(opts.locale, {
    style: "percent",
    minimumFractionDigits: 0,
    maximumFractionDigits: opts.decimalPlaces,
  }).format(value);
}

function formatBoolean(value: unknown): string {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

// Individual parsers

function parseNumber(input: string): number | string {
  // Remove common formatting characters
  const cleaned = input.replace(/[,\s]/g, "");
  const num = Number(cleaned);
  return cleaned === "" || Number.isNaN(num) ? input : num;
}

function parseDate(input: string): string {
  // Keep the text: an ISO date stays as is, anything else is left for
  // validation to flag (no locale guessing between DD/MM and MM/DD).
  return input;
}

function parseCurrency(input: string): number | string {
  // Remove currency symbols and formatting
  const cleaned = input.replace(/[$€£¥₹,\s]/g, "");
  const num = Number(cleaned);
  return cleaned === "" || Number.isNaN(num) ? input : num;
}

function parsePercentage(input: string): number | string {
  // Remove % sign and convert to decimal
  const cleaned = input.replace(/%/g, "").trim();
  const num = Number(cleaned);

  if (cleaned === "" || Number.isNaN(num)) {
    return input;
  }

  // If input had %, convert from percentage to decimal
  if (input.includes("%")) {
    return num / 100;
  }

  return num;
}

function parseBoolean(input: string): boolean | string {
  const lower = input.toLowerCase();

  if (["true", "yes", "1", "on"].includes(lower)) {
    return true;
  }

  if (["false", "no", "0", "off"].includes(lower)) {
    return false;
  }

  return input;
}

/**
 * Create a default cell data object
 * @param type - Cell type
 * @param value - Initial value
 * @returns CellData object
 */
export function createCellData(
  type: CellType = "text",
  value: unknown = null,
): { value: unknown; displayValue: string; type: CellType } {
  return {
    value,
    displayValue: formatCellValue(value, type),
    type,
  };
}

/**
 * Detect the most likely type for a value
 * @param value - Value to analyze
 * @returns Detected cell type
 */
export function detectCellType(value: unknown): CellType {
  if (value === null || value === undefined) {
    return "text";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (value instanceof Date) {
    return "date";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (["true", "false", "yes", "no"].includes(trimmed.toLowerCase())) {
      return "boolean";
    }

    if (/^-?\d+(\.\d+)?%$/.test(trimmed)) {
      return "percentage";
    }

    if (
      /^[$€£¥₹]-?\d+(\.\d+)?$/.test(trimmed) ||
      /^-?\d+(\.\d+)?[$€£¥₹]$/.test(trimmed)
    ) {
      return "currency";
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return "date";
    }

    if (/^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ""))) {
      return "number";
    }
  }

  return "text";
}
