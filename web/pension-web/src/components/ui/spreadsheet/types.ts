/**
 * Spreadsheet Component Types
 * Core type definitions for the spreadsheet component.
 *
 * The grid lives in memory only (see store/index.ts): nothing here is ever
 * written to browser storage.
 */

// Cell Types
export type CellType =
  | "text"
  | "number"
  | "date"
  | "currency"
  | "percentage"
  | "boolean"
  | "dropdown"
  | "multi-dropdown";

export interface CellStyle {
  backgroundColor?: string;
  textColor?: string;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  textDecoration?: "none" | "underline" | "line-through";
}

export interface CellValidation {
  type: "dropdown" | "multi-dropdown" | "required" | "range" | "date" | "regex";
  options?: readonly string[]; // for dropdown
  min?: number; // for range
  max?: number; // for range
  minDate?: Date; // for date
  maxDate?: Date; // for date
  pattern?: string; // for regex
  message?: string; // custom error message (already translated)
}

export interface CellData {
  value: unknown;
  displayValue?: string;
  type: CellType;
  style?: CellStyle;
  validation?: CellValidation;
  /** Error shown as the red corner marker + tooltip. */
  error?: string;
  /**
   * True when `error` came from the server (see BulkUploadSheet `serverErrors`).
   * Server errors survive client re-validation until the cell is edited or a
   * new set of server errors replaces them.
   */
  serverError?: boolean;
  disabled?: boolean;
}

// Selection Types
export interface CellAddress {
  row: number;
  col: number;
}

export interface CellRange {
  start: CellAddress;
  end: CellAddress;
}

export interface Selection {
  ranges: CellRange[];
  activeCell: CellAddress | null;
}

// State Types
export type CellState = "normal" | "selected" | "focused" | "editing" | "error";

// ---------------------------------------------------------------------------
// Delta-based history entries: store only what changed, not the full grid
// ---------------------------------------------------------------------------

interface CellEditHistoryEntry {
  type: "cell-edit";
  timestamp: number;
  row: number;
  col: number;
  oldCell: CellData;
  newCell: CellData;
}

interface MultiCellEditHistoryEntry {
  type: "multi-cell-edit";
  timestamp: number;
  changes: Array<{
    row: number;
    col: number;
    oldCell: CellData;
    newCell: CellData;
  }>;
}

interface RowInsertHistoryEntry {
  type: "row-insert";
  timestamp: number;
  index: number;
}

interface RowDeleteHistoryEntry {
  type: "row-delete";
  timestamp: number;
  index: number;
  rowData: CellData[];
  rowHeight: number;
}

interface ColumnInsertHistoryEntry {
  type: "column-insert";
  timestamp: number;
  index: number;
}

interface ColumnDeleteHistoryEntry {
  type: "column-delete";
  timestamp: number;
  index: number;
  colData: CellData[];
  colWidth: number;
}

interface SortHistoryEntry {
  type: "sort";
  timestamp: number;
  prevData: CellData[][];
  prevSortState: { column: number; direction: "asc" | "desc" } | null;
  newData: CellData[][];
  newSortState: { column: number; direction: "asc" | "desc" } | null;
}

export type HistoryEntry =
  | CellEditHistoryEntry
  | MultiCellEditHistoryEntry
  | RowInsertHistoryEntry
  | RowDeleteHistoryEntry
  | ColumnInsertHistoryEntry
  | ColumnDeleteHistoryEntry
  | SortHistoryEntry;

export type HistoryActionType = HistoryEntry["type"];

export interface SpreadsheetStateData {
  data: CellData[][];
  columnWidths: number[];
  rowHeights: number[];
  hiddenColumns: Set<number>;
  hiddenRows: Set<number>;
  selection: Selection;
  editingCell: CellAddress | null;
  /** Live value from the CellEditor, used to commit on click-away. */
  pendingEditValue: string | null;
}

export interface SpreadsheetState extends SpreadsheetStateData {
  // History
  history: HistoryEntry[];
  historyIndex: number;
  /**
   * Bumped on every user-originated data change (edit, paste, clear, fill,
   * row/column insert or delete, sort, undo, redo). Lets a host tell whether
   * the grid changed since some point (e.g. since the last upload).
   */
  revision: number;
}

// Validation Result
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/** Keys of the built-in validation messages (namespace `spreadsheet.validation`). */
export type ValidationMessageKey =
  | "required"
  | "oneOf"
  | "invalidValues"
  | "notNumber"
  | "min"
  | "max"
  | "invalidDate"
  | "minDate"
  | "maxDate"
  | "pattern";

/** Resolves a validation message key to user-facing (translated) text. */
export type ValidationTranslator = (
  key: ValidationMessageKey,
  values?: Record<string, string | number>,
) => string;

/**
 * Row-level validator a host can install in the store. Called with the row as
 * it is after an edit; returns the error for each column (undefined = valid).
 * When installed it replaces the per-cell `CellValidation` checks.
 */
export type RowValidator = (
  row: readonly CellData[],
  rowIndex: number,
) => ReadonlyArray<string | undefined>;

// Format Options
export interface FormatOptions {
  locale?: string;
  currency?: string;
  dateFormat?: string;
  decimalPlaces?: number;
}

// Direction for navigation
export type Direction = "up" | "down" | "left" | "right";

// Clipboard data structure
export interface ClipboardData {
  cells: CellData[][];
  range: CellRange;
}
