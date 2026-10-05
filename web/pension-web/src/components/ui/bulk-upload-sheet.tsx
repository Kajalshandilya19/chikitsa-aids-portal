"use client";

/**
 * BulkUploadSheet: spreadsheet-style bulk import.
 *
 * Flow:
 * 1. Pick a file (.csv or .xlsx, at most 10 MB and 100000 data rows; .xls and
 *    .xlsm are refused with a "save as .xlsx" message).
 * 2. The file is parsed in the browser (papaparse for CSV, exceljs for XLSX).
 * 3. Column mapping: file headers are matched to `columns` (by label or key);
 *    when every column matches exactly this step is skipped.
 * 4. Preview grid with client-side validation (required, dropdown options,
 *    each column's `validate`, `onValidateRow`). Problems show as a red
 *    corner on the cell with the message in a tooltip.
 * 5. The user fixes cells in the grid (edit, paste, fill, insert/delete rows).
 * 6. Submit rebuilds the file from the grid (same format as the source; the
 *    header row uses each column's `label`; fully empty rows are skipped).
 *    It is NOT formula-guarded: it goes to our own data-service, which reads a
 *    leading = + - @ as text. Files downloaded for people ARE guarded.
 * 7. The parent uploads it in `onUpload` (it owns the import batch and talks
 *    to the server).
 * 8. The parent passes back `summary` (rendered above the grid) and
 *    `serverErrors` (placed onto the matching cells). The grid stays open so
 *    the user can fix cells and "Upload Again".
 * 9. The user confirms (`onConfirm`) or cancels (`onCancelImport`) the batch.
 *
 * The server re-validates everything: the client checks are only a
 * convenience so mistakes are caught before the round trip.
 *
 * Privacy: the grid lives in memory only (no browser storage of any kind)
 * and is reset when the sheet closes or unmounts.
 */

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  Spreadsheet,
  useSpreadsheetStore,
  parseXLSX,
  parseCSVFile,
  rowsToCSV,
  rowsToXLSXBlob,
  downloadFile,
  cellValueToString,
  clearClipboard,
  CSV_MIME,
  XLSX_MIME,
} from "@/components/ui/spreadsheet";
import type {
  CellData,
  CellType,
  CellValidation,
  GridCellError,
  RowValidator,
} from "@/components/ui/spreadsheet";
import { ColumnMappingDialog, autoMatchColumns, type ColumnMapping } from "@/components/ui/column-mapping-dialog";

/** Client-side limits (the server enforces its own as well). */
export const BULK_UPLOAD_MAX_FILE_MB = 10;
export const BULK_UPLOAD_MAX_ROWS = 100_000;
const MAX_FILE_BYTES = BULK_UPLOAD_MAX_FILE_MB * 1024 * 1024;
/** The grid always offers at least this many data rows to type into. */
const MIN_GRID_ROWS = 50;
/** Rows built per chunk before yielding to the event loop. */
const CHUNK_SIZE = 500;
/** Dropdown errors list the options only when there are this few. */
const MAX_OPTIONS_IN_MESSAGE = 10;

export interface BulkUploadColumn {
  /** Server field name; also what server errors use in `field`. */
  key: string;
  /** Header text in the template and in the rebuilt upload file (matched case-insensitively by the server). */
  label: string;
  required?: boolean;
  type?: CellType;
  options?: readonly string[];
  width?: number;
  /** Disabled columns are carried through untouched and hidden in the grid. */
  disabled?: boolean;
  /** When false, dropdown values not in `options` are not flagged (default: true). */
  strict?: boolean;
  /**
   * Extra check for a non-empty value (already trimmed). Return the error
   * message, or null when the value is fine. Not called for empty values;
   * use `required` for those.
   */
  validate?: (value: string) => string | null;
}

export interface ServerRowError {
  /** 1-based DATA row number in the file that was submitted (header not counted). */
  rowNumber: number;
  /** Column key. Unknown fields are shown on the first cell of the row. */
  field: string;
  message: string;
}

export interface BulkUploadSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  columns: readonly BulkUploadColumn[];
  /** Name of the rebuilt upload file; the extension follows the source format. */
  fileName?: string;
  isUploading?: boolean;
  /** Uploads the rebuilt file. Reject to show an error; the grid stays open either way. */
  onUpload: (file: File) => Promise<unknown>;
  onDownloadTemplate?: () => void;
  /**
   * Called whenever a non-empty row is validated, with its cells and its
   * 0-based data row index. May return extra errors keyed by column key.
   */
  onValidateRow?: (
    row: CellData[],
    rowIndex: number,
  ) => void | Readonly<Record<string, string | null | undefined>>;
  /** Errors from the server for the last submitted file; placed onto the grid cells. */
  serverErrors?: readonly ServerRowError[];
  /** Rendered above the grid after a successful upload (batch counts etc.). */
  summary?: React.ReactNode;
  /** Label of the confirm button (default "Confirm Import"). */
  confirmLabel?: React.ReactNode;
  /** Shows a primary "Confirm Import" button while `summary` is set. */
  onConfirm?: () => Promise<void> | void;
  /** Default true. */
  canConfirm?: boolean;
  isConfirming?: boolean;
  /** Called by "Cancel Import" (and when the sheet is closed while a summary is shown). */
  onCancelImport?: () => Promise<void> | void;
}

type Step = "upload" | "mapping" | "preview";
type SourceFormat = "csv" | "xlsx";

const isBlankValue = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === "string" && value.trim() === "");

const rowHasData = (row: readonly CellData[]): boolean => row.some((c) => !isBlankValue(c?.value));

/** "beneficiaries.csv" + "xlsx" gives "beneficiaries.xlsx". */
const withExtension = (name: string, ext: SourceFormat): string =>
  `${name.replace(/\.[^./\\]+$/, "") || "upload"}.${ext}`;

const errorText = (err: unknown): string | undefined =>
  err instanceof Error && err.message ? err.message : undefined;

/** Map a value onto its canonical dropdown option when it differs only by
 *  case or spaces ("male" to "Male"), so harmless casing is fixed instead of
 *  flagged. Unmatched values pass through untouched. */
const canonicalizeOption = (value: string, options?: readonly string[]): string => {
  if (!value || !options?.length || options.includes(value)) return value;
  const lower = value.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === lower) ?? value;
};

/** Same fix for multi-dropdown cells, per comma-separated part. */
const canonicalizeMultiOption = (value: string, options?: readonly string[]): string => {
  if (!value || !options?.length) return value;
  const parts = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const fixed = parts.map((v) => canonicalizeOption(v, options));
  return fixed.some((v, i) => v !== parts[i]) ? fixed.join(", ") : value;
};

const validationFor = (col: BulkUploadColumn): CellValidation | undefined =>
  col.type === "dropdown" && col.options
    ? { type: "dropdown", options: col.options }
    : col.type === "multi-dropdown" && col.options
      ? { type: "multi-dropdown", options: col.options }
      : undefined;

const sameOptions = (a?: readonly string[], b?: readonly string[]): boolean =>
  a === b || (!!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]));

/** Normalize one raw file value for its column (booleans, JSON arrays, option casing). */
function normalizeValue(raw: string, col: BulkUploadColumn): string {
  let value = raw.trim();
  if (!value) return value;

  // true/false dropdowns accept yes/no/1/0
  if (
    col.type === "dropdown" &&
    col.options?.length === 2 &&
    col.options.includes("true") &&
    col.options.includes("false")
  ) {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "yes" || lower === "1") value = "true";
    else if (lower === "false" || lower === "no" || lower === "0") value = "false";
  }

  // Strip JSON array brackets from multi-dropdown values
  if (col.type === "multi-dropdown" && value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(value);
      value = Array.isArray(parsed) ? parsed.map(String).join(", ") : value;
    } catch {
      value = value.slice(1, -1).replace(/"/g, "").trim();
    }
  }

  if (col.type === "dropdown") return canonicalizeOption(value, col.options);
  if (col.type === "multi-dropdown") return canonicalizeMultiOption(value, col.options);
  return value;
}

export function BulkUploadSheet({
  open,
  onOpenChange,
  title,
  description,
  columns,
  fileName = "upload.csv",
  isUploading = false,
  onUpload,
  onDownloadTemplate,
  onValidateRow,
  serverErrors,
  summary,
  confirmLabel,
  onConfirm,
  canConfirm = true,
  isConfirming = false,
  onCancelImport,
}: BulkUploadSheetProps) {
  const t = useTranslations("bulkUpload");
  const tMap = useTranslations("columnMapping");
  const locale = useLocale();

  const [step, setStep] = React.useState<Step>("upload");
  const [sourceFormat, setSourceFormat] = React.useState<SourceFormat>("csv");
  const [parsedRows, setParsedRows] = React.useState<string[][]>([]);
  const [fileHeaders, setFileHeaders] = React.useState<string[]>([]);
  const [columnMappings, setColumnMappings] = React.useState<ColumnMapping[]>([]);
  const [isParsing, setIsParsing] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  /** Store revision captured at the last submit (null = nothing submitted yet). */
  const [submittedRevision, setSubmittedRevision] = React.useState<number | null>(null);
  /** Bumped each time onUpload settles; server errors are applied after that. */
  const [uploadSeq, setUploadSeq] = React.useState(0);
  const [counts, setCounts] = React.useState({ rows: 0, errors: 0, clientErrors: 0, serverErrors: 0 });
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  /** Submitted data row number (1-based) minus 1 gives the grid row index. */
  const rowMapRef = React.useRef<number[]>([]);
  /**
   * The spreadsheet store is a single global: only the instance that loaded
   * the current grid resets it, so a second (closed) BulkUploadSheet on the
   * page never wipes another one's work.
   */
  const ownsStoreRef = React.useRef(false);

  const storeData = useSpreadsheetStore((s) => s.data);
  const revision = useSpreadsheetStore((s) => s.revision);

  // Latest props for the (stable) row validator
  const latest = React.useRef({ columns, onValidateRow, t });
  React.useLayoutEffect(() => {
    latest.current = { columns, onValidateRow, t };
  });

  /** Client-side validation of one grid row (row 0 is the header). */
  const validateRow = React.useCallback<RowValidator>((row, rowIndex) => {
    if (rowIndex === 0 || !rowHasData(row)) return [];
    const { columns: cols, onValidateRow: hook, t: tr } = latest.current;
    const extra = hook ? hook([...row], rowIndex - 1) : undefined;
    const extraMap = extra && typeof extra === "object" ? extra : undefined;

    return cols.map((col, ci) => {
      const cell = row[ci];
      if (!cell || cell.disabled) return undefined;
      const fromHook = extraMap?.[col.key] || undefined;
      const value = cellValueToString(cell.value).trim();

      if (!value) {
        return col.required ? tr("errors.required", { label: col.label }) : fromHook;
      }

      const strict = col.strict !== false;
      if (strict && col.type === "dropdown" && col.options && !col.options.includes(value)) {
        return col.options.length <= MAX_OPTIONS_IN_MESSAGE
          ? tr("errors.oneOf", { options: col.options.join(", ") })
          : tr("errors.notInList");
      }
      if (strict && col.type === "multi-dropdown" && col.options) {
        const options = col.options;
        const invalid = value
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v && !options.includes(v));
        if (invalid.length > 0) {
          return options.length <= MAX_OPTIONS_IN_MESSAGE
            ? tr("errors.invalidValues", { values: invalid.join(", "), options: options.join(", ") })
            : tr("errors.invalidValuesShort", { values: invalid.join(", ") });
        }
      }
      if (col.validate) {
        const message = col.validate(value);
        if (message) return message;
      }
      return fromHook;
    });
  }, []);

  /** Local session state back to the first step. */
  const resetLocalState = React.useCallback(() => {
    setStep("upload");
    setSourceFormat("csv");
    setParsedRows([]);
    setFileHeaders([]);
    setColumnMappings([]);
    setSubmittedRevision(null);
    setUploadSeq(0);
    setCounts({ rows: 0, errors: 0, clientErrors: 0, serverErrors: 0 });
  }, []);

  /** Grid, clipboard and row map gone (all memory only). */
  const resetExternal = React.useCallback(() => {
    rowMapRef.current = [];
    if (!ownsStoreRef.current) return;
    ownsStoreRef.current = false;
    useSpreadsheetStore.getState().reset();
    clearClipboard();
  }, []);

  /** Everything this session holds, gone: grid, clipboard, parsed file. */
  const resetSession = React.useCallback(() => {
    resetLocalState();
    resetExternal();
  }, [resetLocalState, resetExternal]);

  // Reset when the sheet closes (also when the parent sets open=false):
  // local state is adjusted during render, the store in an effect.
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) resetLocalState();
  }
  React.useEffect(() => {
    if (!open) resetExternal();
  }, [open, resetExternal]);

  // Reset on unmount
  React.useEffect(
    () => () => {
      if (!ownsStoreRef.current) return;
      ownsStoreRef.current = false;
      useSpreadsheetStore.getState().reset();
      clearClipboard();
    },
    [],
  );

  // Debounced row / error counts (avoids scanning big grids on every keystroke)
  React.useEffect(() => {
    if (step !== "preview") return;
    const timer = setTimeout(() => {
      const data = useSpreadsheetStore.getState().data;
      let rows = 0;
      let errors = 0;
      let clientErrors = 0;
      let serverErrorCells = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (rowHasData(row)) rows++;
        for (const cell of row) {
          if (!cell.error) continue;
          errors++;
          if (cell.serverError) serverErrorCells++;
          else clientErrors++;
        }
      }
      setCounts({ rows, errors, clientErrors, serverErrors: serverErrorCells });
    }, 300);
    return () => clearTimeout(timer);
  }, [storeData, step]);

  // Re-validate when the column definitions change after import (e.g. dropdown
  // options that arrive asynchronously) or the language changes. Keyed on a
  // content signature so a new `columns` array with the same content is a no-op.
  const columnsSignature = React.useMemo(
    () =>
      JSON.stringify(
        columns.map((c) => [c.key, c.label, c.required, c.type, c.options, c.strict, c.disabled]),
      ),
    [columns],
  );
  React.useEffect(() => {
    if (step !== "preview") return;
    const store = useSpreadsheetStore.getState();
    const cols = latest.current.columns;
    const data = store.data;
    let next: CellData[][] | null = null;

    // Refresh dropdown options and re-apply the option casing fix
    for (let ri = 1; ri < data.length; ri++) {
      const row = data[ri];
      let newRow: CellData[] | null = null;
      for (let ci = 0; ci < cols.length && ci < row.length; ci++) {
        const col = cols[ci];
        const cell = row[ci];
        const validation = validationFor(col);
        const raw = cellValueToString(cell.value);
        const fixed =
          col.type === "dropdown" || col.type === "multi-dropdown" ? normalizeValue(raw, col) : raw;
        const optionsChanged = !sameOptions(cell.validation?.options, validation?.options);
        if (optionsChanged || fixed !== raw) {
          newRow ??= [...row];
          newRow[ci] = {
            ...cell,
            validation,
            ...(fixed !== raw ? { value: fixed || null, displayValue: fixed } : {}),
          };
        }
      }
      if (newRow) {
        next ??= [...data];
        next[ri] = newRow;
      }
    }
    if (next) useSpreadsheetStore.setState({ data: next });
    store.setRowValidator(validateRow);
    store.revalidateAll();
  }, [columnsSignature, locale, step, validateRow]);

  // Place server errors onto the grid. Applied when their content changes or
  // an upload settles (so identical errors after "Upload Again" show again),
  // never before the first upload of this session.
  const serverErrorsSignature = React.useMemo(() => JSON.stringify(serverErrors ?? []), [serverErrors]);
  React.useEffect(() => {
    if (step !== "preview" || uploadSeq === 0) return;
    const parsed = JSON.parse(serverErrorsSignature) as ServerRowError[];
    const cols = latest.current.columns;
    const data = useSpreadsheetStore.getState().data;
    const rowMap = rowMapRef.current;
    const firstVisible = Math.max(0, cols.findIndex((c) => !c.disabled));

    const placed: GridCellError[] = [];
    for (const e of parsed) {
      const gridRow = rowMap[e.rowNumber - 1];
      if (gridRow === undefined || gridRow < 1 || gridRow >= data.length) continue;
      const field = String(e.field ?? "");
      let col = cols.findIndex((c) => c.key === field);
      if (col < 0) col = cols.findIndex((c) => c.label.toLowerCase() === field.toLowerCase());
      let message = String(e.message ?? "");
      if (col < 0 || cols[col].disabled) {
        const name = col >= 0 ? cols[col].label : field;
        if (name) message = `${name}: ${message}`;
        col = firstVisible;
      }
      placed.push({ row: gridRow, col, message });
    }
    useSpreadsheetStore.getState().applyServerErrors(placed);
  }, [serverErrorsSignature, uploadSeq, step]);

  /** Build one grid row from mapped file values (errors filled in by the validator). */
  const buildRow = React.useCallback((srcRow: readonly string[] | undefined, cols: readonly BulkUploadColumn[]) => {
    return cols.map((col, ci): CellData => {
      const value = normalizeValue(srcRow?.[ci] ?? "", col);
      return {
        value: value || null,
        displayValue: value,
        type: col.type ?? "text",
        validation: validationFor(col),
        disabled: col.disabled,
      };
    });
  }, []);

  /** Build the grid in chunks so big files do not freeze the page. */
  const buildGrid = React.useCallback(
    async (dataRows: readonly string[][], cols: readonly BulkUploadColumn[]): Promise<CellData[][]> => {
      const total = Math.max(dataRows.length, MIN_GRID_ROWS);
      const headerRow: CellData[] = cols.map((col) => ({
        value: col.label,
        displayValue: col.label,
        type: "text",
        style: { fontWeight: "bold" },
        disabled: true,
      }));
      const rows: CellData[][] = [headerRow];

      for (let start = 0; start < total; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, total);
        for (let ri = start; ri < end; ri++) {
          const row = buildRow(dataRows[ri], cols);
          const errors = validateRow(row, ri + 1);
          rows.push(
            errors.some(Boolean) ? row.map((cell, ci) => (errors[ci] ? { ...cell, error: errors[ci] } : cell)) : row,
          );
        }
        if (end < total) await new Promise<void>((r) => setTimeout(r, 0));
      }
      return rows;
    },
    [buildRow, validateRow],
  );

  /** Load mapped data rows into the grid and show the preview. */
  const loadIntoSpreadsheet = React.useCallback(
    async (dataRows: string[][]) => {
      const cols = latest.current.columns;
      const grid = await buildGrid(dataRows, cols);
      const store = useSpreadsheetStore.getState();
      ownsStoreRef.current = true;
      store.reset();
      store.setRowValidator(validateRow);
      useSpreadsheetStore.setState({
        data: grid,
        columnWidths: cols.map((col) => col.width ?? 140),
        rowHeights: Array.from({ length: grid.length }, () => 28),
        hiddenColumns: new Set(cols.flatMap((col, idx) => (col.disabled ? [idx] : []))),
      });
      rowMapRef.current = [];
      setSubmittedRevision(null);
      setParsedRows([]);
      setStep("preview");
    },
    [buildGrid, validateRow],
  );

  /** Detect the header row, auto-match columns and pick the next step. */
  const analyzeFile = React.useCallback(
    async (rows: string[][]) => {
      if (rows.length === 0) {
        toast.error(t("errors.fileEmpty"));
        return;
      }
      const cols = latest.current.columns;
      const firstRow = rows[0];
      const candidateHeaders = firstRow.map((h) => (h ?? "").trim());
      const mappings = autoMatchColumns(candidateHeaders, cols);
      const allExact = mappings.every((m) => m.matchType === "exact");
      const anyMatch = mappings.some((m) => m.fileColumnIndex >= 0);

      if (anyMatch && allExact) {
        // Every column matched its label or key exactly: straight to the preview
        const claimed = new Set(mappings.map((m) => m.fileColumnIndex));
        const skipped = candidateHeaders.filter((h, idx) => h && !claimed.has(idx));
        if (skipped.length > 0) {
          toast.info(t("unmatchedColumns", { count: skipped.length, names: skipped.join(", ") }));
        }
        const mapped = rows
          .slice(1)
          .map((r) => mappings.map((m) => (m.fileColumnIndex >= 0 ? (r[m.fileColumnIndex] ?? "").trim() : "")));
        await loadIntoSpreadsheet(mapped);
        return;
      }

      if (anyMatch) {
        setFileHeaders(candidateHeaders.map((h, i) => h || tMap("syntheticHeader", { index: i + 1 })));
        setParsedRows(rows.slice(1));
        setColumnMappings(mappings);
        setStep("mapping");
        return;
      }

      // No header row recognised: every row is data, columns get numbered names
      const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
      const synthetic = Array.from({ length: width }, (_, i) => tMap("syntheticHeader", { index: i + 1 }));
      setFileHeaders(synthetic);
      setParsedRows(rows);
      setColumnMappings(autoMatchColumns(synthetic, cols));
      setStep("mapping");
    },
    [loadIntoSpreadsheet, t, tMap],
  );

  /** Apply the confirmed column mapping and show the preview. */
  const applyMappingsAndBuildGrid = React.useCallback(async () => {
    setIsParsing(true);
    try {
      const mapped = parsedRows.map((row) =>
        columnMappings.map((m) => (m.fileColumnIndex >= 0 ? (row[m.fileColumnIndex] ?? "").trim() : "")),
      );
      await loadIntoSpreadsheet(mapped);
    } finally {
      setIsParsing(false);
    }
  }, [parsedRows, columnMappings, loadIntoSpreadsheet]);

  const handleFileSelect = async (file: File) => {
    const name = file.name.toLowerCase();
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot + 1) : "";

    if (ext === "xls" || ext === "xlsm" || ext === "xlsb") {
      toast.error(t("errors.saveAsXlsx"));
      return;
    }
    if (ext !== "csv" && ext !== "xlsx") {
      toast.error(t("errors.unsupportedType"));
      return;
    }
    if (file.size === 0) {
      toast.error(t("errors.fileEmpty"));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("errors.fileTooLarge", { maxMb: BULK_UPLOAD_MAX_FILE_MB }));
      return;
    }

    setIsParsing(true);
    setSourceFormat(ext);
    try {
      // Header + the allowed rows + one more, so "too many rows" can be detected
      const rows = ext === "xlsx" ? await parseXLSX(file) : await parseCSVFile(file, BULK_UPLOAD_MAX_ROWS + 2);
      if (rows.length > BULK_UPLOAD_MAX_ROWS + 1) {
        toast.error(t("errors.tooManyRows", { maxRows: BULK_UPLOAD_MAX_ROWS }));
        return;
      }
      await analyzeFile(rows);
    } catch {
      toast.error(t("errors.parseFailed"));
    } finally {
      setIsParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && !isParsing) void handleFileSelect(file);
  };

  /** Header + non-empty rows of the grid as strings, and where each row came from. */
  const collectRows = () => {
    const cols = latest.current.columns;
    const { data } = useSpreadsheetStore.getState();
    const rows: string[][] = [];
    const rowMap: number[] = [];
    for (let ri = 1; ri < data.length; ri++) {
      const row = data[ri];
      if (!rowHasData(row)) continue;
      rowMap.push(ri);
      rows.push(cols.map((_, ci) => cellValueToString(row[ci]?.value)));
    }
    return { headers: cols.map((c) => c.label), rows, rowMap, data };
  };

  const showReview = summary !== undefined && summary !== null && summary !== false;
  const isDirty = submittedRevision !== null && revision !== submittedRevision;

  const handleSubmit = async () => {
    if (isUploading || isConfirming) return;

    // Commit a cell that is still being edited
    const store = useSpreadsheetStore.getState();
    if (store.editingCell) store.commitEdit(store.pendingEditValue ?? "");

    const cols = latest.current.columns;
    const { headers, rows, rowMap, data } = collectRows();
    if (rows.length === 0) {
      toast.error(t("errors.noData"));
      return;
    }
    if (rows.length > BULK_UPLOAD_MAX_ROWS) {
      toast.error(t("errors.tooManyRows", { maxRows: BULK_UPLOAD_MAX_ROWS }));
      return;
    }

    // Client-side errors block the upload; server errors do not (the server checks again)
    const missing = new Set<string>();
    let clientErrors = 0;
    for (const ri of rowMap) {
      data[ri].forEach((cell, ci) => {
        if (!cell.error || cell.serverError) return;
        clientErrors++;
        const col = cols[ci];
        if (col?.required && isBlankValue(cell.value)) missing.add(col.label);
      });
    }
    if (clientErrors > 0) {
      toast.error(
        missing.size > 0
          ? t("errors.requiredMissing", { fields: Array.from(missing).join(", ") })
          : t("errors.fixErrors"),
      );
      return;
    }

    let file: File;
    try {
      // Unguarded on purpose: this file goes to our own data-service, which stores a leading
      // = + - @ as text and re-validates every cell; a guard quote would change the value.
      if (sourceFormat === "xlsx") {
        const blob = await rowsToXLSXBlob(headers, rows, "Sheet1", { guard: false });
        file = new File([blob], withExtension(fileName, "xlsx"), { type: XLSX_MIME });
      } else {
        const csv = rowsToCSV(headers, rows, { guard: false });
        file = new File([csv], withExtension(fileName, "csv"), { type: CSV_MIME });
      }
    } catch {
      toast.error(t("errors.buildFailed"));
      return;
    }

    rowMapRef.current = rowMap;
    setSubmittedRevision(useSpreadsheetStore.getState().revision);
    // Old server errors no longer match the new file
    useSpreadsheetStore.getState().applyServerErrors([]);

    try {
      await onUpload(file);
    } catch (err) {
      toast.error(errorText(err) ?? t("errors.uploadFailed"));
    } finally {
      setUploadSeq((n) => n + 1);
    }
  };

  const runCancelImport = async () => {
    if (!onCancelImport) return;
    try {
      await onCancelImport();
    } catch (err) {
      toast.error(errorText(err) ?? t("errors.cancelFailed"));
    }
  };

  const handleConfirm = async () => {
    if (!onConfirm) return;
    try {
      await onConfirm();
    } catch (err) {
      toast.error(errorText(err) ?? t("errors.confirmFailed"));
    }
  };

  const handleClose = () => {
    if (showReview) void runCancelImport();
    resetSession();
    onOpenChange(false);
  };

  const handleStartOver = () => {
    if (showReview) void runCancelImport();
    resetSession();
  };

  const handleDownloadData = () => {
    const { headers, rows } = collectRows();
    downloadFile(rowsToCSV(headers, rows, { bom: true }), withExtension(fileName, "csv"), CSV_MIME);
  };

  const openPicker = () => {
    if (!isParsing) fileInputRef.current?.click();
  };

  const busy = isUploading || isConfirming;

  return (
    <>
      {/* Step 1: pick a file */}
      <Dialog
        open={open && step === "upload"}
        onOpenChange={(v) => {
          if (!v) handleClose();
        }}
      >
        <DialogContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-3">
            <DialogTitle>{title ?? t("title")}</DialogTitle>
            <DialogDescription>{description ?? t("description")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 px-5 py-4">
            {onDownloadTemplate && (
              <div className="bg-muted/30 flex shrink-0 items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{t("templateTitle")}</p>
                  <p className="text-muted-foreground text-xs">{t("templateHint")}</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={onDownloadTemplate}>
                  <IconDownload />
                  {t("templateButton")}
                </Button>
              </div>
            )}

            <div
              role="button"
              tabIndex={0}
              aria-label={t("dropTitle")}
              aria-busy={isParsing || undefined}
              className={cn(
                "border-border/60 bg-muted/20 hover:border-primary/50 hover:bg-muted/30 flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 transition-colors",
                "focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
                isDragging && "border-primary bg-primary/5",
              )}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isDragging) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={openPicker}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openPicker();
                }
              }}
            >
              {isParsing ? (
                <>
                  <Spinner className="size-8" />
                  <p className="text-sm font-medium">{t("parsing")}</p>
                </>
              ) : (
                <>
                  <IconFileSpreadsheet className="text-muted-foreground size-8" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{t("dropTitle")}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t("dropHint", { maxMb: BULK_UPLOAD_MAX_FILE_MB, maxRows: BULK_UPLOAD_MAX_ROWS })}
                    </p>
                  </div>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  // Clear so the same file can be picked again and the File is not kept around
                  e.target.value = "";
                  if (file) void handleFileSelect(file);
                }}
              />
            </div>
          </div>

          <div className="bg-background flex shrink-0 flex-row items-center justify-end gap-2 border-t px-5 py-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("cancel")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Step 2: column mapping */}
      <ColumnMappingDialog
        open={open && step === "mapping"}
        fileHeaders={fileHeaders}
        parsedRows={parsedRows}
        mappings={columnMappings}
        onMappingsChange={setColumnMappings}
        onConfirm={() => void applyMappingsAndBuildGrid()}
        onBack={resetSession}
        onOpenChange={(v) => {
          if (!v) handleClose();
        }}
        isBusy={isParsing}
      />

      {/* Step 3: preview grid, fix, upload, review */}
      <Sheet
        open={open && step === "preview"}
        onOpenChange={(sheetOpen) => {
          if (!sheetOpen) handleClose();
        }}
      >
        <SheetContent
          className="flex max-w-[1400px] flex-col gap-0 p-0 data-[side=right]:w-full lg:data-[side=right]:w-[90vw]"
          // Edits would be lost: only the buttons close this sheet
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <SheetHeader className="shrink-0 border-b px-5 pt-5 pb-3">
            <SheetTitle>{title ?? t("title")}</SheetTitle>
            <SheetDescription>{description ?? t("description")}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-hidden px-5 py-4">
            {showReview && <div className="shrink-0">{summary}</div>}

            {showReview && isDirty && (
              <p className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                <IconAlertTriangle className="size-4 shrink-0" />
                {t("editedSinceUpload")}
              </p>
            )}

            <div
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                counts.errors > 0
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
                  : "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
              )}
              role="status"
            >
              {counts.errors > 0 ? (
                <IconAlertTriangle className="size-4 shrink-0" />
              ) : (
                <IconCircleCheck className="size-4 shrink-0" />
              )}
              <span>
                {t("rowsLoaded", { count: counts.rows })}
                {" · "}
                {counts.errors > 0 ? t("cellsWithErrors", { count: counts.errors }) : t("allValid")}
                {counts.serverErrors > 0 && (
                  <>
                    {" · "}
                    {t("fromServer", { count: counts.serverErrors })}
                  </>
                )}
              </span>
              {counts.errors > 0 && (
                <span className="hidden opacity-80 lg:inline">{t("hoverHint")}</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("downloadData")}
                  aria-label={t("downloadData")}
                  onClick={handleDownloadData}
                >
                  <IconDownload />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  title={t("startOver")}
                  aria-label={t("startOver")}
                  onClick={handleStartOver}
                  disabled={busy}
                >
                  <IconX />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
              <Spreadsheet className="h-full" readOnly={busy} allowColumnEdits={false} lockHeaderRow />
            </div>
          </div>

          <div className="bg-background flex shrink-0 flex-row flex-wrap items-center justify-end gap-2 border-t px-5 py-3">
            {showReview && onCancelImport ? (
              <Button type="button" variant="outline" onClick={() => void runCancelImport()} disabled={busy}>
                {t("cancelImport")}
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
            )}
            <Button
              type="button"
              variant={showReview && onConfirm ? "outline" : "default"}
              onClick={() => void handleSubmit()}
              disabled={busy || counts.rows === 0}
            >
              {isUploading ? (
                <>
                  <Spinner />
                  {t("uploading")}
                </>
              ) : (
                <>
                  <IconUpload />
                  {showReview ? t("uploadAgain") : t("uploadRows", { count: counts.rows })}
                </>
              )}
            </Button>
            {showReview && onConfirm && (
              <Button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={!canConfirm || busy || isDirty}
              >
                {isConfirming ? (
                  <>
                    <Spinner />
                    {t("confirming")}
                  </>
                ) : (
                  (confirmLabel ?? t("confirmImport"))
                )}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
