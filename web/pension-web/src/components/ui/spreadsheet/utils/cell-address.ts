/**
 * Cell Address Utilities
 * Handles cell address formatting, parsing, and range operations
 */

import type { CellAddress, CellRange } from '../types';
import { columnIndexToLetter, letterToColumnIndex } from './column';

/**
 * Format a cell address to string representation
 * @param address - Cell address with row and col
 * @returns String representation (e.g., "A1", "B2", "AA100")
 * @example formatCellAddress({ row: 0, col: 0 }) => 'A1'
 * @example formatCellAddress({ row: 99, col: 26 }) => 'AA100'
 */
export function formatCellAddress(address: CellAddress): string {
  const column = columnIndexToLetter(address.col);
  const row = address.row + 1; // Convert to 1-indexed
  return `${column}${row}`;
}

/**
 * Parse a cell address string to CellAddress object
 * @param address - String representation (e.g., "A1", "B2", "AA100")
 * @returns CellAddress object with row and col
 * @example parseCellAddress('A1') => { row: 0, col: 0 }
 * @example parseCellAddress('AA100') => { row: 99, col: 26 }
 */
export function parseCellAddress(address: string): CellAddress {
  const match = address.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  
  if (!match) {
    throw new Error(`Invalid cell address: ${address}. Expected format like 'A1', 'B2', 'AA100'.`);
  }

  const [, column, row] = match;
  
  return {
    col: letterToColumnIndex(column),
    row: Number.parseInt(row, 10) - 1, // Convert to 0-indexed
  };
}

/**
 * Check if a cell address is within a range
 * @param address - Cell address to check
 * @param range - Range to check against
 * @returns True if address is within range
 */
export function isInRange(address: CellAddress, range: CellRange): boolean {
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);

  return (
    address.row >= minRow &&
    address.row <= maxRow &&
    address.col >= minCol &&
    address.col <= maxCol
  );
}

/**
 * Get all cell addresses within a range
 * @param range - Cell range
 * @returns Array of all cell addresses in the range
 */
export function getRangeAddresses(range: CellRange): CellAddress[] {
  const addresses: CellAddress[] = [];
  
  const minRow = Math.min(range.start.row, range.end.row);
  const maxRow = Math.max(range.start.row, range.end.row);
  const minCol = Math.min(range.start.col, range.end.col);
  const maxCol = Math.max(range.start.col, range.end.col);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      addresses.push({ row, col });
    }
  }

  return addresses;
}

/**
 * Normalize a range so start is top-left and end is bottom-right
 * @param range - Cell range to normalize
 * @returns Normalized range
 */
export function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

/**
 * Get the dimensions of a range
 * @param range - Cell range
 * @returns Object with rows and cols count
 */
export function getRangeDimensions(range: CellRange): { rows: number; cols: number } {
  const normalized = normalizeRange(range);
  return {
    rows: normalized.end.row - normalized.start.row + 1,
    cols: normalized.end.col - normalized.start.col + 1,
  };
}

/**
 * Format a range to string representation
 * @param range - Cell range
 * @returns String representation (e.g., "A1:B2")
 */
export function formatRange(range: CellRange): string {
  return `${formatCellAddress(range.start)}:${formatCellAddress(range.end)}`;
}

/**
 * Parse a range string to CellRange object
 * @param rangeStr - String representation (e.g., "A1:B2")
 * @returns CellRange object
 */
export function parseRange(rangeStr: string): CellRange {
  const parts = rangeStr.split(':');
  
  if (parts.length !== 2) {
    throw new Error(`Invalid range: ${rangeStr}. Expected format like 'A1:B2'.`);
  }

  return {
    start: parseCellAddress(parts[0]),
    end: parseCellAddress(parts[1]),
  };
}

/**
 * Check if two cell addresses are equal
 * @param a - First address
 * @param b - Second address
 * @returns True if addresses are equal
 */
export function addressEquals(a: CellAddress, b: CellAddress): boolean {
  return a.row === b.row && a.col === b.col;
}

/**
 * Create a unique key for a cell address (for use in Maps/Sets)
 * @param address - Cell address
 * @returns Unique string key
 */
export function addressKey(address: CellAddress): string {
  return `${address.row},${address.col}`;
}
