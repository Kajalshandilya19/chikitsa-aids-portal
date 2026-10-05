"use client";

/**
 * Spreadsheet Zustand Store
 * Central state management for the spreadsheet component.
 *
 * In memory only: there is deliberately no persistence middleware. The grid
 * can hold personal data (beneficiary uploads), so it must never reach browser
 * storage. Hosts call `reset()` when the grid is discarded.
 *
 * Performance: uses delta-based history (stores only what changed per action,
 * not full grid snapshots) so row-delete / cell-edit stay O(1) in memory.
 *
 * Validation: after every value change the touched rows are re-validated,
 * either by the host's `rowValidator` (when installed) or by each cell's own
 * `CellValidation`. Cells flagged `serverError` keep their error until they
 * are edited or `applyServerErrors` replaces the set.
 */

import { create } from "zustand";
import type {
  CellAddress,
  CellData,
  CellRange,
  CellStyle,
  CellType,
  CellValidation,
  HistoryEntry,
  RowValidator,
  SpreadsheetState,
  ValidationTranslator,
} from "../types";
import { formatCellValue, parseInputValue } from "../utils/formatters";
import { addressKey, normalizeRange, getRangeAddresses } from "../utils/cell-address";
import { keyOnlyTranslator, validateCellValue } from "../utils/validation";

// Default configuration
const DEFAULT_ROWS = 100;
const DEFAULT_COLS = 26;
const DEFAULT_COLUMN_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 28;
const MAX_HISTORY = 50;

function createEmptyCell(): CellData {
  return { value: null, displayValue: "", type: "text" };
}

function createInitialData(rows: number, cols: number): CellData[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => createEmptyCell()),
  );
}

export type SortDirection = "asc" | "desc" | null;
export interface SortState {
  column: number;
  direction: SortDirection;
}

/** One server-side error placed on a grid cell (grid coordinates). */
export interface GridCellError {
  row: number;
  col: number;
  message: string;
}

// Distributive Omit so it works correctly over the HistoryEntry union
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

interface SpreadsheetActions {
  // Data Actions
  setCellValue: (address: CellAddress, value: unknown) => void;
  setCellType: (address: CellAddress, type: CellType) => void;
  setCellStyle: (address: CellAddress, style: Partial<CellStyle>) => void;
  setCellValidation: (address: CellAddress, validation: CellValidation | undefined) => void;
  getCellData: (address: CellAddress) => CellData | undefined;
  /** Apply multiple cell value changes in a single state update + single history entry. */
  batchSetCellValues: (updates: Array<{ row: number; col: number; value: unknown }>) => void;

  // Selection Actions
  selectCell: (address: CellAddress) => void;
  extendSelection: (address: CellAddress) => void;
  addToSelection: (address: CellAddress) => void;
  selectRange: (range: CellRange) => void;
  clearSelection: () => void;
  getSelectedCells: () => CellAddress[];
  getSelectionAnchor: () => CellAddress | null;

  // Editing Actions
  startEditing: (address: CellAddress) => void;
  commitEdit: (value: unknown) => void;
  cancelEdit: () => void;

  // Row/Column Actions
  /**
   * Append empty rows (shaped like the last row) until the grid has at least
   * `count` rows. Not recorded in history (empty rows carry no data).
   */
  ensureRows: (count: number) => void;
  insertRow: (index: number, position: "before" | "after") => void;
  deleteRow: (index: number) => void;
  insertColumn: (index: number, position: "before" | "after") => void;
  deleteColumn: (index: number) => void;
  setColumnWidth: (index: number, width: number) => void;
  setRowHeight: (index: number, height: number) => void;
  hideColumn: (index: number) => void;
  showColumn: (index: number) => void;
  hideRow: (index: number) => void;
  showRow: (index: number) => void;

  // History Actions
  undo: () => void;
  redo: () => void;

  // Sort Actions
  sortByColumn: (colIndex: number) => void;

  // Validation
  /** Install (or remove) a row-level validator; does not re-validate by itself. */
  setRowValidator: (validator: RowValidator | null) => void;
  /** Install the translator used for the built-in `CellValidation` messages. */
  setTranslator: (translate: ValidationTranslator) => void;
  /** Re-validate every row (keeps server errors). */
  revalidateAll: () => void;
  /**
   * Replace all server errors: previous server errors are cleared (and those
   * cells re-validated client side), then the given ones are placed. Several
   * errors on one cell are joined on separate lines. Does not touch history
   * or `revision`.
   */
  applyServerErrors: (errors: readonly GridCellError[]) => void;

  // Utility Actions
  /** Restore the initial (empty) state. Keeps the installed translator. */
  reset: () => void;
}

interface ExtraState {
  selectionAnchor: CellAddress | null;
  sortState: SortState | null;
  rowValidator: RowValidator | null;
  translate: ValidationTranslator;
}

export type SpreadsheetStore = SpreadsheetState & SpreadsheetActions & ExtraState;

type StoreData = SpreadsheetState & Omit<ExtraState, "translate">;

/** Fresh initial state (new arrays and Sets each time, nothing shared). */
function createInitialState(): StoreData {
  return {
    data: createInitialData(DEFAULT_ROWS, DEFAULT_COLS),
    columnWidths: Array.from({ length: DEFAULT_COLS }, () => DEFAULT_COLUMN_WIDTH),
    rowHeights: Array.from({ length: DEFAULT_ROWS }, () => DEFAULT_ROW_HEIGHT),
    hiddenColumns: new Set<number>(),
    hiddenRows: new Set<number>(),
    selection: { ranges: [], activeCell: null },
    selectionAnchor: null,
    editingCell: null,
    pendingEditValue: null,
    history: [],
    historyIndex: -1,
    revision: 0,
    sortState: null,
    rowValidator: null,
  };
}

const inBounds = (data: CellData[][], row: number, col: number): boolean =>
  row >= 0 && col >= 0 && row < data.length && col < (data[0]?.length ?? 0);

/** A cell after a value change: error recomputed later, server error dropped. */
function editedCell(oldCell: CellData, value: unknown, type: CellType = oldCell.type || "text"): CellData {
  return {
    ...oldCell,
    value,
    displayValue: formatCellValue(value, type),
    error: undefined,
    serverError: undefined,
  };
}

/**
 * Re-validate the given rows of `data` in place. `copied` tracks rows already
 * shallow-copied in this update so each row is copied at most once.
 */
function revalidateRowsInto(
  data: CellData[][],
  copied: Set<number>,
  rows: Iterable<number>,
  validator: RowValidator | null,
  translate: ValidationTranslator,
): void {
  for (const r of rows) {
    const row = data[r];
    if (!row) continue;
    const errors = validator ? validator(row, r) : null;
    let out: CellData[] | null = null;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell || cell.disabled || cell.serverError) continue;
      const error = errors
        ? errors[c] || undefined
        : validateCellValue(cell.value, cell.validation, translate).error;
      if (cell.error === error) continue;
      if (!out) out = copied.has(r) ? row : [...row];
      out[c] = { ...cell, error };
    }
    if (out && out !== row) {
      data[r] = out;
      copied.add(r);
    }
  }
}

export const useSpreadsheetStore = create<SpreadsheetStore>()((set, get) => {
  /** Push a delta-based history entry. */
  const pushHistory = (entry: DistributiveOmit<HistoryEntry, "timestamp">) => {
    const state = get();
    const newHistory = [
      ...state.history.slice(0, state.historyIndex + 1),
      { ...entry, timestamp: Date.now() } as HistoryEntry,
    ].slice(-MAX_HISTORY);
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  };

  /** Re-validate rows of a new data array (copying rows as needed). */
  const revalidate = (data: CellData[][], copied: Set<number>, rows: Iterable<number>) => {
    const { rowValidator, translate } = get();
    revalidateRowsInto(data, copied, rows, rowValidator, translate);
  };

  /** Apply cell changes (from history) to the grid and re-validate their rows. */
  const applyCells = (cells: Array<{ row: number; col: number; cell: CellData }>): CellData[][] => {
    const newData = [...get().data];
    const copied = new Set<number>();
    for (const { row, col, cell } of cells) {
      if (!newData[row]) continue;
      if (!copied.has(row)) {
        newData[row] = [...newData[row]];
        copied.add(row);
      }
      newData[row][col] = cell;
    }
    revalidate(newData, copied, copied);
    return newData;
  };

  return {
    ...createInitialState(),
    translate: keyOnlyTranslator,

    // ── Data Actions ──────────────────────────────────────────────────
    setCellValue: (address, value) => {
      const state = get();
      const { row, col } = address;
      if (!inBounds(state.data, row, col)) return;

      const oldCell = state.data[row][col];
      if (oldCell?.disabled) return;

      const newCell = editedCell(oldCell, value);
      const newData = [...state.data];
      newData[row] = [...newData[row]];
      newData[row][col] = newCell;
      const copied = new Set([row]);
      revalidate(newData, copied, [row]);

      pushHistory({ type: "cell-edit", row, col, oldCell: { ...oldCell }, newCell });
      set({ data: newData, revision: state.revision + 1 });
    },

    setCellType: (address, type) => {
      const state = get();
      const { row, col } = address;
      if (!inBounds(state.data, row, col)) return;

      const oldCell = state.data[row][col];
      const newCell: CellData = {
        ...oldCell,
        type,
        displayValue: formatCellValue(oldCell?.value, type),
      };
      const newData = [...state.data];
      newData[row] = [...newData[row]];
      newData[row][col] = newCell;
      revalidate(newData, new Set([row]), [row]);
      set({ data: newData });
    },

    setCellStyle: (address, style) => {
      const state = get();
      const { row, col } = address;
      if (!inBounds(state.data, row, col)) return;

      const oldCell = state.data[row][col];
      const newData = [...state.data];
      newData[row] = [...newData[row]];
      newData[row][col] = { ...oldCell, style: { ...oldCell?.style, ...style } };
      set({ data: newData });
    },

    setCellValidation: (address, validation) => {
      const state = get();
      const { row, col } = address;
      if (!inBounds(state.data, row, col)) return;

      const oldCell = state.data[row][col];
      const newData = [...state.data];
      newData[row] = [...newData[row]];
      newData[row][col] = { ...oldCell, validation };
      revalidate(newData, new Set([row]), [row]);
      set({ data: newData });
    },

    getCellData: (address) => {
      const state = get();
      const { row, col } = address;
      if (!inBounds(state.data, row, col)) return undefined;
      return state.data[row][col];
    },

    // ── Batch cell updates (single state change + single history entry) ──
    batchSetCellValues: (updates) => {
      const state = get();
      const newData = [...state.data];
      const copied = new Set<number>();
      const changes: Array<{ row: number; col: number; oldCell: CellData; newCell: CellData }> = [];

      for (const { row, col, value } of updates) {
        if (!inBounds(state.data, row, col)) continue;
        const oldCell = state.data[row][col];
        if (oldCell?.disabled) continue;

        if (!copied.has(row)) {
          newData[row] = [...newData[row]];
          copied.add(row);
        }
        const newCell = editedCell(oldCell, value);
        newData[row][col] = newCell;
        changes.push({ row, col, oldCell: { ...oldCell }, newCell });
      }

      if (changes.length === 0) return;
      revalidate(newData, copied, new Set(copied));

      pushHistory({ type: "multi-cell-edit", changes });
      set({ data: newData, revision: state.revision + 1 });
    },

    // ── Selection Actions ─────────────────────────────────────────────
    selectCell: (address) => {
      set({
        selection: { ranges: [{ start: address, end: address }], activeCell: address },
        selectionAnchor: address,
      });
    },

    extendSelection: (address) => {
      const state = get();
      const anchor = state.selectionAnchor || state.selection.activeCell;
      if (!anchor) {
        get().selectCell(address);
        return;
      }
      set({
        selection: { ranges: [{ start: anchor, end: address }], activeCell: address },
      });
    },

    addToSelection: (address) => {
      const state = get();
      set({
        selection: {
          ranges: [...state.selection.ranges, { start: address, end: address }],
          activeCell: address,
        },
        selectionAnchor: address,
      });
    },

    selectRange: (range) => {
      set({
        selection: { ranges: [range], activeCell: range.start },
        selectionAnchor: range.start,
      });
    },

    clearSelection: () => {
      set({ selection: { ranges: [], activeCell: null }, selectionAnchor: null });
    },

    getSelectedCells: () => {
      const state = get();
      const cells: CellAddress[] = [];
      const seen = new Set<string>();

      for (const range of state.selection.ranges) {
        for (const addr of getRangeAddresses(normalizeRange(range))) {
          const key = addressKey(addr);
          if (!seen.has(key)) {
            seen.add(key);
            cells.push(addr);
          }
        }
      }
      return cells;
    },

    getSelectionAnchor: () => get().selectionAnchor,

    // ── Editing Actions ───────────────────────────────────────────────
    startEditing: (address) => {
      const state = get();
      const isAddressSelected = state.selection.ranges.some((range) => {
        const n = normalizeRange(range);
        return (
          address.row >= n.start.row &&
          address.row <= n.end.row &&
          address.col >= n.start.col &&
          address.col <= n.end.col
        );
      });

      if (!isAddressSelected || state.selection.ranges.length === 0) {
        get().selectCell(address);
      } else {
        set({ selection: { ...state.selection, activeCell: address } });
      }
      set({ editingCell: address });
    },

    commitEdit: (value) => {
      const state = get();
      const { editingCell } = state;
      if (!editingCell) return;

      const cell = state.data[editingCell.row]?.[editingCell.col];
      const type = cell?.type || "text";
      const selectedCells = get().getSelectedCells();

      if (selectedCells.length > 1) {
        // Multi-cell edit: apply to all selected cells, one state update
        const newData = [...state.data];
        const copied = new Set<number>();
        const changes: Array<{ row: number; col: number; oldCell: CellData; newCell: CellData }> = [];

        for (const addr of selectedCells) {
          const targetCell = state.data[addr.row]?.[addr.col];
          if (!targetCell || targetCell.disabled) continue;

          if (!copied.has(addr.row)) {
            newData[addr.row] = [...newData[addr.row]];
            copied.add(addr.row);
          }

          const targetType = targetCell.type || "text";
          const newCell = editedCell(targetCell, parseInputValue(String(value), targetType), targetType);
          newData[addr.row][addr.col] = newCell;
          changes.push({ row: addr.row, col: addr.col, oldCell: { ...targetCell }, newCell });
        }

        if (changes.length > 0) {
          revalidate(newData, copied, new Set(copied));
          pushHistory({ type: "multi-cell-edit", changes });
          set({
            data: newData,
            editingCell: null,
            pendingEditValue: null,
            revision: state.revision + 1,
          });
        } else {
          set({ editingCell: null, pendingEditValue: null });
        }
      } else {
        // Single cell edit: skip when nothing changed (clicking away from an
        // untouched cell must not count as an edit or clear its server error)
        const parsedValue = parseInputValue(String(value ?? ""), type);
        const current = cell?.value ?? null;
        if (cell && String(parsedValue ?? "") !== String(current ?? "")) {
          get().setCellValue(editingCell, parsedValue);
        }
        set({ editingCell: null, pendingEditValue: null });
      }
    },

    cancelEdit: () => {
      set({ editingCell: null, pendingEditValue: null });
    },

    // ── Row/Column Actions ────────────────────────────────────────────
    ensureRows: (count) => {
      const state = get();
      const missing = count - state.data.length;
      if (missing <= 0) return;
      const cols = state.data[0]?.length || DEFAULT_COLS;
      const template = state.data.length > 1 ? state.data[state.data.length - 1] : undefined;
      const extra = Array.from({ length: missing }, () =>
        Array.from({ length: cols }, (_, c): CellData => {
          const src = template?.[c];
          return src
            ? { value: null, displayValue: "", type: src.type, validation: src.validation, disabled: src.disabled }
            : createEmptyCell();
        }),
      );
      set({
        data: [...state.data, ...extra],
        rowHeights: [...state.rowHeights, ...Array.from({ length: missing }, () => DEFAULT_ROW_HEIGHT)],
      });
    },

    insertRow: (index, position) => {
      const state = get();
      const insertIndex = position === "before" ? index : index + 1;
      const cols = state.data[0]?.length || DEFAULT_COLS;
      // New rows inherit each column's type/validation/disabled from the row above
      const template = state.data[Math.max(1, insertIndex - 1)] ?? state.data[insertIndex];
      const newRow = Array.from({ length: cols }, (_, c): CellData => {
        const src = template?.[c];
        return src
          ? { value: null, displayValue: "", type: src.type, validation: src.validation, disabled: src.disabled }
          : createEmptyCell();
      });

      const newData = [...state.data];
      newData.splice(insertIndex, 0, newRow);
      const newRowHeights = [...state.rowHeights];
      newRowHeights.splice(insertIndex, 0, DEFAULT_ROW_HEIGHT);

      pushHistory({ type: "row-insert", index: insertIndex });
      set({ data: newData, rowHeights: newRowHeights, revision: state.revision + 1 });
    },

    deleteRow: (index) => {
      const state = get();
      if (index < 0 || index >= state.data.length || state.data.length <= 1) return;

      const deletedRow = state.data[index];
      const deletedHeight = state.rowHeights[index] ?? DEFAULT_ROW_HEIGHT;

      const newData = [...state.data];
      newData.splice(index, 1);
      const newRowHeights = [...state.rowHeights];
      newRowHeights.splice(index, 1);

      pushHistory({ type: "row-delete", index, rowData: deletedRow, rowHeight: deletedHeight });
      set({ data: newData, rowHeights: newRowHeights, revision: state.revision + 1 });
    },

    insertColumn: (index, position) => {
      const state = get();
      const insertIndex = position === "before" ? index : index + 1;

      const newData = state.data.map((row) => {
        const newRow = [...row];
        newRow.splice(insertIndex, 0, createEmptyCell());
        return newRow;
      });
      const newColumnWidths = [...state.columnWidths];
      newColumnWidths.splice(insertIndex, 0, DEFAULT_COLUMN_WIDTH);

      pushHistory({ type: "column-insert", index: insertIndex });
      set({ data: newData, columnWidths: newColumnWidths, revision: state.revision + 1 });
    },

    deleteColumn: (index) => {
      const state = get();
      const cols = state.data[0]?.length || 0;
      if (index < 0 || index >= cols || cols <= 1) return;

      const colData = state.data.map((row) => row[index]);
      const colWidth = state.columnWidths[index] ?? DEFAULT_COLUMN_WIDTH;

      const newData = state.data.map((row) => {
        const newRow = [...row];
        newRow.splice(index, 1);
        return newRow;
      });
      const newColumnWidths = [...state.columnWidths];
      newColumnWidths.splice(index, 1);

      pushHistory({ type: "column-delete", index, colData, colWidth });
      set({ data: newData, columnWidths: newColumnWidths, revision: state.revision + 1 });
    },

    setColumnWidth: (index, width) => {
      const state = get();
      if (index < 0 || index >= state.columnWidths.length) return;
      const newColumnWidths = [...state.columnWidths];
      newColumnWidths[index] = Math.max(30, width);
      set({ columnWidths: newColumnWidths });
    },

    setRowHeight: (index, height) => {
      const state = get();
      if (index < 0 || index >= state.rowHeights.length) return;
      const newRowHeights = [...state.rowHeights];
      newRowHeights[index] = Math.max(20, height);
      set({ rowHeights: newRowHeights });
    },

    hideColumn: (index) => {
      const next = new Set(get().hiddenColumns);
      next.add(index);
      set({ hiddenColumns: next });
    },

    showColumn: (index) => {
      const next = new Set(get().hiddenColumns);
      next.delete(index);
      set({ hiddenColumns: next });
    },

    hideRow: (index) => {
      const next = new Set(get().hiddenRows);
      next.add(index);
      set({ hiddenRows: next });
    },

    showRow: (index) => {
      const next = new Set(get().hiddenRows);
      next.delete(index);
      set({ hiddenRows: next });
    },

    // ── History Actions (delta-based undo/redo) ───────────────────────
    undo: () => {
      const state = get();
      if (state.historyIndex < 0) return;
      const entry = state.history[state.historyIndex];
      const historyIndex = state.historyIndex - 1;
      const revision = state.revision + 1;

      switch (entry.type) {
        case "cell-edit": {
          const data = applyCells([{ row: entry.row, col: entry.col, cell: entry.oldCell }]);
          set({ data, historyIndex, revision });
          break;
        }
        case "multi-cell-edit": {
          const data = applyCells(entry.changes.map((ch) => ({ row: ch.row, col: ch.col, cell: ch.oldCell })));
          set({ data, historyIndex, revision });
          break;
        }
        case "row-delete": {
          const data = [...state.data];
          data.splice(entry.index, 0, entry.rowData);
          const rowHeights = [...state.rowHeights];
          rowHeights.splice(entry.index, 0, entry.rowHeight);
          set({ data, rowHeights, historyIndex, revision });
          break;
        }
        case "row-insert": {
          const data = [...state.data];
          data.splice(entry.index, 1);
          const rowHeights = [...state.rowHeights];
          rowHeights.splice(entry.index, 1);
          set({ data, rowHeights, historyIndex, revision });
          break;
        }
        case "column-delete": {
          const data = state.data.map((row, ri) => {
            const newRow = [...row];
            newRow.splice(entry.index, 0, entry.colData[ri] ?? createEmptyCell());
            return newRow;
          });
          const columnWidths = [...state.columnWidths];
          columnWidths.splice(entry.index, 0, entry.colWidth);
          set({ data, columnWidths, historyIndex, revision });
          break;
        }
        case "column-insert": {
          const data = state.data.map((row) => {
            const newRow = [...row];
            newRow.splice(entry.index, 1);
            return newRow;
          });
          const columnWidths = [...state.columnWidths];
          columnWidths.splice(entry.index, 1);
          set({ data, columnWidths, historyIndex, revision });
          break;
        }
        case "sort": {
          set({ data: entry.prevData, sortState: entry.prevSortState, historyIndex, revision });
          break;
        }
      }
    },

    redo: () => {
      const state = get();
      if (state.historyIndex >= state.history.length - 1) return;
      const entry = state.history[state.historyIndex + 1];
      const historyIndex = state.historyIndex + 1;
      const revision = state.revision + 1;

      switch (entry.type) {
        case "cell-edit": {
          const data = applyCells([{ row: entry.row, col: entry.col, cell: entry.newCell }]);
          set({ data, historyIndex, revision });
          break;
        }
        case "multi-cell-edit": {
          const data = applyCells(entry.changes.map((ch) => ({ row: ch.row, col: ch.col, cell: ch.newCell })));
          set({ data, historyIndex, revision });
          break;
        }
        case "row-delete": {
          const data = [...state.data];
          data.splice(entry.index, 1);
          const rowHeights = [...state.rowHeights];
          rowHeights.splice(entry.index, 1);
          set({ data, rowHeights, historyIndex, revision });
          break;
        }
        case "row-insert": {
          const cols = state.data[0]?.length || DEFAULT_COLS;
          const data = [...state.data];
          data.splice(entry.index, 0, Array.from({ length: cols }, () => createEmptyCell()));
          const rowHeights = [...state.rowHeights];
          rowHeights.splice(entry.index, 0, DEFAULT_ROW_HEIGHT);
          set({ data, rowHeights, historyIndex, revision });
          break;
        }
        case "column-delete": {
          const data = state.data.map((row) => {
            const newRow = [...row];
            newRow.splice(entry.index, 1);
            return newRow;
          });
          const columnWidths = [...state.columnWidths];
          columnWidths.splice(entry.index, 1);
          set({ data, columnWidths, historyIndex, revision });
          break;
        }
        case "column-insert": {
          const data = state.data.map((row) => {
            const newRow = [...row];
            newRow.splice(entry.index, 0, createEmptyCell());
            return newRow;
          });
          const columnWidths = [...state.columnWidths];
          columnWidths.splice(entry.index, 0, DEFAULT_COLUMN_WIDTH);
          set({ data, columnWidths, historyIndex, revision });
          break;
        }
        case "sort": {
          set({ data: entry.newData, sortState: entry.newSortState, historyIndex, revision });
          break;
        }
      }
    },

    // ── Sort Actions ──────────────────────────────────────────────────
    sortByColumn: (colIndex) => {
      const state = get();
      const current = state.sortState;

      let nextDirection: SortDirection;
      if (!current || current.column !== colIndex) {
        nextDirection = "asc";
      } else if (current.direction === "asc") {
        nextDirection = "desc";
      } else {
        nextDirection = null;
      }

      if (nextDirection === null) {
        set({ sortState: null });
        return;
      }
      const direction = nextDirection;

      // Row 0 is the header, sort only data rows (1+)
      const headerRow = state.data[0];
      const sorted = state.data.slice(1).sort((a, b) => {
        const aVal = String(a[colIndex]?.value ?? "").toLowerCase();
        const bVal = String(b[colIndex]?.value ?? "").toLowerCase();

        if (!aVal && !bVal) return 0;
        if (!aVal) return 1;
        if (!bVal) return -1;

        const aNum = Number(aVal);
        const bNum = Number(bVal);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          return direction === "asc" ? aNum - bNum : bNum - aNum;
        }

        const cmp = aVal.localeCompare(bVal);
        return direction === "asc" ? cmp : -cmp;
      });

      const newData = [headerRow, ...sorted];
      const newSortState = { column: colIndex, direction };
      const prevSortState =
        state.sortState && state.sortState.direction
          ? { column: state.sortState.column, direction: state.sortState.direction }
          : null;

      pushHistory({ type: "sort", prevData: state.data, prevSortState, newData, newSortState });
      set({ data: newData, sortState: newSortState, revision: state.revision + 1 });
    },

    // ── Validation ────────────────────────────────────────────────────
    setRowValidator: (validator) => set({ rowValidator: validator }),

    setTranslator: (translate) => set({ translate }),

    revalidateAll: () => {
      const data = [...get().data];
      const copied = new Set<number>();
      revalidate(data, copied, data.keys());
      if (copied.size > 0) set({ data });
    },

    applyServerErrors: (errors) => {
      const data = [...get().data];
      const copied = new Set<number>();
      const copyRow = (r: number): CellData[] => {
        if (!copied.has(r)) {
          data[r] = [...data[r]];
          copied.add(r);
        }
        return data[r];
      };

      // 1. Drop the previous server errors, then re-validate those rows client side
      const cleared = new Set<number>();
      for (let r = 0; r < data.length; r++) {
        const row = data[r];
        for (let c = 0; c < row.length; c++) {
          if (row[c]?.serverError) {
            copyRow(r)[c] = { ...row[c], serverError: undefined, error: undefined };
            cleared.add(r);
          }
        }
      }
      revalidate(data, copied, cleared);

      // 2. Place the new ones (several on one cell are joined)
      const byCell = new Map<string, GridCellError & { messages: string[] }>();
      for (const e of errors) {
        if (!inBounds(data, e.row, e.col)) continue;
        const key = `${e.row},${e.col}`;
        const entry = byCell.get(key);
        if (entry) entry.messages.push(e.message);
        else byCell.set(key, { ...e, messages: [e.message] });
      }
      for (const { row, col, messages } of byCell.values()) {
        const target = copyRow(row);
        target[col] = { ...target[col], error: messages.join("\n"), serverError: true };
      }

      if (copied.size > 0) set({ data });
    },

    // ── Utility Actions ───────────────────────────────────────────────
    reset: () => {
      set(createInitialState());
    },
  };
});
