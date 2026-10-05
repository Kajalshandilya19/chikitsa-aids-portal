/**
 * Clipboard Manager
 * Handles copy, cut, paste operations for the spreadsheet.
 *
 * The internal fallback clipboard is a plain module variable (memory only).
 * Call `clearClipboard()` when the grid is discarded so copied cell data does
 * not outlive it.
 */

import type { CellAddress, CellData, CellRange, ClipboardData } from "../types";
import { normalizeRange, getRangeDimensions } from "./cell-address";
import { cellValueToString } from "./formatters";

// Internal clipboard (for when the browser clipboard is unavailable)
let internalClipboard: ClipboardData | null = null;
let isCutOperation = false;

const cellText = (cell: CellData | undefined): string =>
  cell?.displayValue ?? cellValueToString(cell?.value);

/**
 * Serialize cells to TSV format for clipboard
 */
export function serializeCellsToTSV(
  data: CellData[][],
  range: CellRange,
): string {
  const normalized = normalizeRange(range);
  const rows: string[] = [];

  for (let row = normalized.start.row; row <= normalized.end.row; row++) {
    const cols: string[] = [];
    for (let col = normalized.start.col; col <= normalized.end.col; col++) {
      // Tabs and newlines inside a value would split it into extra cells on paste.
      cols.push(cellText(data[row]?.[col]).replace(/[\t\r\n]+/g, " "));
    }
    rows.push(cols.join("\t"));
  }

  return rows.join("\n");
}

/**
 * Parse TSV format from clipboard to 2D array
 */
export function parseTSVToCells(tsv: string): string[][] {
  if (!tsv || tsv.trim() === "") {
    return [];
  }

  // Split by newlines, handling both \n and \r\n; drop the trailing empty
  // line spreadsheet apps add after the last row.
  const rows = tsv.split(/\r?\n/);
  if (rows.length > 1 && rows[rows.length - 1] === "") rows.pop();

  return rows.map((row) => row.split("\t"));
}

/**
 * Copy selected cells to clipboard
 */
export async function copyToClipboard(
  data: CellData[][],
  range: CellRange,
): Promise<boolean> {
  const normalized = normalizeRange(range);
  const tsv = serializeCellsToTSV(data, normalized);

  // Store in internal clipboard
  const cells: CellData[][] = [];
  for (let row = normalized.start.row; row <= normalized.end.row; row++) {
    const rowCells: CellData[] = [];
    for (let col = normalized.start.col; col <= normalized.end.col; col++) {
      const cellData = data[row]?.[col];
      rowCells.push(
        cellData ? { ...cellData } : { value: null, type: "text", displayValue: "" },
      );
    }
    cells.push(rowCells);
  }

  internalClipboard = { cells, range: normalized };
  isCutOperation = false;

  // Try to use the browser clipboard; the internal one is the fallback.
  try {
    await navigator.clipboard.writeText(tsv);
  } catch {
    // Browser clipboard not available: the internal clipboard will be used.
  }
  return true;
}

/**
 * Cut selected cells to clipboard
 */
export async function cutToClipboard(
  data: CellData[][],
  range: CellRange,
): Promise<boolean> {
  const result = await copyToClipboard(data, range);
  isCutOperation = true;
  return result;
}

/**
 * Check if there's a pending cut operation
 */
export function hasPendingCut(): boolean {
  return isCutOperation && internalClipboard !== null;
}

/**
 * Get the cut source range
 */
export function getCutSourceRange(): CellRange | null {
  if (isCutOperation && internalClipboard) {
    return internalClipboard.range;
  }
  return null;
}

/**
 * Clear the cut operation flag
 */
export function clearCutOperation(): void {
  isCutOperation = false;
}

/**
 * Drop everything held by the internal clipboard.
 */
export function clearClipboard(): void {
  internalClipboard = null;
  isCutOperation = false;
}

/**
 * Paste from clipboard to target location
 */
export async function pasteFromClipboard(
  _targetCell: CellAddress,
): Promise<{ cells: string[][]; dimensions: { rows: number; cols: number } } | null> {
  // Try browser clipboard first
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const cells = parseTSVToCells(text);
      if (cells.length > 0) {
        return {
          cells,
          dimensions: {
            rows: cells.length,
            cols: Math.max(...cells.map((row) => row.length)),
          },
        };
      }
    }
  } catch {
    // Browser clipboard not available
  }

  // Fall back to internal clipboard
  if (internalClipboard) {
    const cells = internalClipboard.cells.map((row) => row.map((cell) => cellText(cell)));
    const dimensions = getRangeDimensions(internalClipboard.range);
    return { cells, dimensions };
  }

  return null;
}

/**
 * Get internal clipboard data (for internal paste operations)
 */
export function getInternalClipboard(): ClipboardData | null {
  return internalClipboard;
}

/**
 * Fill cells down from source to target range
 */
export function fillDown(
  data: CellData[][],
  sourceRange: CellRange,
  targetRange: CellRange,
): Map<string, CellData> {
  const changes = new Map<string, CellData>();
  const sourceNorm = normalizeRange(sourceRange);
  const targetNorm = normalizeRange(targetRange);

  const sourceRow = sourceNorm.start.row;
  const sourceCells: CellData[] = [];

  for (let col = sourceNorm.start.col; col <= sourceNorm.end.col; col++) {
    sourceCells.push(data[sourceRow]?.[col] || { value: null, type: "text", displayValue: "" });
  }

  for (let row = targetNorm.start.row; row <= targetNorm.end.row; row++) {
    if (row === sourceRow) continue; // Skip source row

    for (let col = targetNorm.start.col; col <= targetNorm.end.col; col++) {
      const sourceIndex = col - sourceNorm.start.col;
      if (sourceIndex >= 0 && sourceIndex < sourceCells.length) {
        changes.set(`${row},${col}`, { ...sourceCells[sourceIndex] });
      }
    }
  }

  return changes;
}

/**
 * Fill cells right from source to target range
 */
export function fillRight(
  data: CellData[][],
  sourceRange: CellRange,
  targetRange: CellRange,
): Map<string, CellData> {
  const changes = new Map<string, CellData>();
  const sourceNorm = normalizeRange(sourceRange);
  const targetNorm = normalizeRange(targetRange);

  const sourceCol = sourceNorm.start.col;
  const sourceCells: CellData[] = [];

  for (let row = sourceNorm.start.row; row <= sourceNorm.end.row; row++) {
    sourceCells.push(data[row]?.[sourceCol] || { value: null, type: "text", displayValue: "" });
  }

  for (let col = targetNorm.start.col; col <= targetNorm.end.col; col++) {
    if (col === sourceCol) continue; // Skip source column

    for (let row = targetNorm.start.row; row <= targetNorm.end.row; row++) {
      const sourceIndex = row - sourceNorm.start.row;
      if (sourceIndex >= 0 && sourceIndex < sourceCells.length) {
        changes.set(`${row},${col}`, { ...sourceCells[sourceIndex] });
      }
    }
  }

  return changes;
}

/**
 * Calculate fill direction based on drag
 */
export function getFillDirection(
  sourceRange: CellRange,
  targetCell: CellAddress,
): "down" | "up" | "right" | "left" | null {
  const sourceNorm = normalizeRange(sourceRange);

  if (targetCell.col >= sourceNorm.start.col && targetCell.col <= sourceNorm.end.col) {
    if (targetCell.row > sourceNorm.end.row) return "down";
    if (targetCell.row < sourceNorm.start.row) return "up";
  }

  if (targetCell.row >= sourceNorm.start.row && targetCell.row <= sourceNorm.end.row) {
    if (targetCell.col > sourceNorm.end.col) return "right";
    if (targetCell.col < sourceNorm.start.col) return "left";
  }

  return null;
}
