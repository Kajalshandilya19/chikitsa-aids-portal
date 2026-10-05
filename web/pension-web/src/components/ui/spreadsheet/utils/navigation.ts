/**
 * Navigation Manager
 * Handles keyboard navigation and cell movement
 */

import type { CellAddress, CellData, Direction } from '../types';

interface NavigationContext {
  data: CellData[][];
  hiddenRows: Set<number>;
  hiddenColumns: Set<number>;
  activeCell: CellAddress | null;
  viewportRows: number;
}

/**
 * Get the next visible row index in a direction
 */
function getNextVisibleRow(
  currentRow: number,
  direction: 'up' | 'down',
  hiddenRows: Set<number>,
  maxRows: number
): number {
  let nextRow = direction === 'down' ? currentRow + 1 : currentRow - 1;

  while (nextRow >= 0 && nextRow < maxRows && hiddenRows.has(nextRow)) {
    nextRow = direction === 'down' ? nextRow + 1 : nextRow - 1;
  }

  return Math.max(0, Math.min(maxRows - 1, nextRow));
}

/**
 * Get the next visible column index in a direction
 */
function getNextVisibleColumn(
  currentCol: number,
  direction: 'left' | 'right',
  hiddenColumns: Set<number>,
  maxCols: number
): number {
  let nextCol = direction === 'right' ? currentCol + 1 : currentCol - 1;

  while (nextCol >= 0 && nextCol < maxCols && hiddenColumns.has(nextCol)) {
    nextCol = direction === 'right' ? nextCol + 1 : nextCol - 1;
  }

  return Math.max(0, Math.min(maxCols - 1, nextCol));
}

/**
 * Move up one cell
 */
export function moveUp(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const newRow = getNextVisibleRow(
    ctx.activeCell.row,
    'up',
    ctx.hiddenRows,
    ctx.data.length
  );

  return { row: newRow, col: ctx.activeCell.col };
}

/**
 * Move down one cell
 */
export function moveDown(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const newRow = getNextVisibleRow(
    ctx.activeCell.row,
    'down',
    ctx.hiddenRows,
    ctx.data.length
  );

  return { row: newRow, col: ctx.activeCell.col };
}

/**
 * Move left one cell
 */
export function moveLeft(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const maxCols = ctx.data[0]?.length || 0;
  const newCol = getNextVisibleColumn(
    ctx.activeCell.col,
    'left',
    ctx.hiddenColumns,
    maxCols
  );

  return { row: ctx.activeCell.row, col: newCol };
}

/**
 * Move right one cell
 */
export function moveRight(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const maxCols = ctx.data[0]?.length || 0;
  const newCol = getNextVisibleColumn(
    ctx.activeCell.col,
    'right',
    ctx.hiddenColumns,
    maxCols
  );

  return { row: ctx.activeCell.row, col: newCol };
}

/**
 * Move to the start of the current row
 */
export function moveToRowStart(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const maxCols = ctx.data[0]?.length || 0;
  let col = 0;

  // Find first visible column
  while (col < maxCols && ctx.hiddenColumns.has(col)) {
    col++;
  }

  return { row: ctx.activeCell.row, col };
}

/**
 * Move to the last cell with data in the current row
 */
export function moveToRowEnd(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  const row = ctx.data[ctx.activeCell.row];
  if (!row) return ctx.activeCell;

  let lastDataCol = row.length - 1;

  // Find last column with data
  for (let col = row.length - 1; col >= 0; col--) {
    if (!ctx.hiddenColumns.has(col)) {
      const cell = row[col];
      if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') {
        lastDataCol = col;
        break;
      }
    }
  }

  // If no data found, go to last visible column
  if (lastDataCol === row.length - 1) {
    while (lastDataCol > 0 && ctx.hiddenColumns.has(lastDataCol)) {
      lastDataCol--;
    }
  }

  return { row: ctx.activeCell.row, col: lastDataCol };
}

/**
 * Jump to the edge of data region in a direction (Ctrl+Arrow)
 */
export function moveToDataEdge(
  ctx: NavigationContext,
  direction: Direction
): CellAddress | null {
  if (!ctx.activeCell) return null;

  const { row, col } = ctx.activeCell;
  const maxRows = ctx.data.length;
  const maxCols = ctx.data[0]?.length || 0;

  const currentCell = ctx.data[row]?.[col];
  const currentHasData = currentCell?.value !== null && 
                         currentCell?.value !== undefined && 
                         currentCell?.value !== '';

  switch (direction) {
    case 'up': {
      let newRow = row;
      if (currentHasData) {
        // Move to first empty cell or edge
        while (newRow > 0) {
          const nextRow = getNextVisibleRow(newRow, 'up', ctx.hiddenRows, maxRows);
          if (nextRow === newRow) break;
          const cell = ctx.data[nextRow]?.[col];
          if (cell?.value === null || cell?.value === undefined || cell?.value === '') {
            break;
          }
          newRow = nextRow;
        }
      } else {
        // Move to first cell with data or edge
        while (newRow > 0) {
          const nextRow = getNextVisibleRow(newRow, 'up', ctx.hiddenRows, maxRows);
          if (nextRow === newRow) break;
          const cell = ctx.data[nextRow]?.[col];
          if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') {
            newRow = nextRow;
            break;
          }
          newRow = nextRow;
        }
      }
      return { row: newRow, col };
    }

    case 'down': {
      let newRow = row;
      if (currentHasData) {
        while (newRow < maxRows - 1) {
          const nextRow = getNextVisibleRow(newRow, 'down', ctx.hiddenRows, maxRows);
          if (nextRow === newRow) break;
          const cell = ctx.data[nextRow]?.[col];
          if (cell?.value === null || cell?.value === undefined || cell?.value === '') {
            break;
          }
          newRow = nextRow;
        }
      } else {
        while (newRow < maxRows - 1) {
          const nextRow = getNextVisibleRow(newRow, 'down', ctx.hiddenRows, maxRows);
          if (nextRow === newRow) break;
          const cell = ctx.data[nextRow]?.[col];
          if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') {
            newRow = nextRow;
            break;
          }
          newRow = nextRow;
        }
      }
      return { row: newRow, col };
    }

    case 'left': {
      let newCol = col;
      if (currentHasData) {
        while (newCol > 0) {
          const nextCol = getNextVisibleColumn(newCol, 'left', ctx.hiddenColumns, maxCols);
          if (nextCol === newCol) break;
          const cell = ctx.data[row]?.[nextCol];
          if (cell?.value === null || cell?.value === undefined || cell?.value === '') {
            break;
          }
          newCol = nextCol;
        }
      } else {
        while (newCol > 0) {
          const nextCol = getNextVisibleColumn(newCol, 'left', ctx.hiddenColumns, maxCols);
          if (nextCol === newCol) break;
          const cell = ctx.data[row]?.[nextCol];
          if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') {
            newCol = nextCol;
            break;
          }
          newCol = nextCol;
        }
      }
      return { row, col: newCol };
    }

    case 'right': {
      let newCol = col;
      if (currentHasData) {
        while (newCol < maxCols - 1) {
          const nextCol = getNextVisibleColumn(newCol, 'right', ctx.hiddenColumns, maxCols);
          if (nextCol === newCol) break;
          const cell = ctx.data[row]?.[nextCol];
          if (cell?.value === null || cell?.value === undefined || cell?.value === '') {
            break;
          }
          newCol = nextCol;
        }
      } else {
        while (newCol < maxCols - 1) {
          const nextCol = getNextVisibleColumn(newCol, 'right', ctx.hiddenColumns, maxCols);
          if (nextCol === newCol) break;
          const cell = ctx.data[row]?.[nextCol];
          if (cell?.value !== null && cell?.value !== undefined && cell?.value !== '') {
            newCol = nextCol;
            break;
          }
          newCol = nextCol;
        }
      }
      return { row, col: newCol };
    }

    default:
      return ctx.activeCell;
  }
}

/**
 * Page up - move up by viewport height
 */
export function pageUp(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  let newRow = ctx.activeCell.row;
  let moved = 0;

  while (moved < ctx.viewportRows && newRow > 0) {
    const nextRow = getNextVisibleRow(newRow, 'up', ctx.hiddenRows, ctx.data.length);
    if (nextRow === newRow) break;
    newRow = nextRow;
    moved++;
  }

  return { row: newRow, col: ctx.activeCell.col };
}

/**
 * Page down - move down by viewport height
 */
export function pageDown(ctx: NavigationContext): CellAddress | null {
  if (!ctx.activeCell) return null;

  let newRow = ctx.activeCell.row;
  let moved = 0;

  while (moved < ctx.viewportRows && newRow < ctx.data.length - 1) {
    const nextRow = getNextVisibleRow(newRow, 'down', ctx.hiddenRows, ctx.data.length);
    if (nextRow === newRow) break;
    newRow = nextRow;
    moved++;
  }

  return { row: newRow, col: ctx.activeCell.col };
}

/**
 * Tab navigation - move to next cell, wrapping to next row
 */
export function tab(ctx: NavigationContext, reverse: boolean = false): CellAddress | null {
  if (!ctx.activeCell) return null;

  const maxCols = ctx.data[0]?.length || 0;
  const maxRows = ctx.data.length;

  if (reverse) {
    // Shift+Tab - move left, wrap to previous row
    const newCol = getNextVisibleColumn(
      ctx.activeCell.col,
      'left',
      ctx.hiddenColumns,
      maxCols
    );

    if (newCol < ctx.activeCell.col) {
      return { row: ctx.activeCell.row, col: newCol };
    }

    // Wrap to previous row
    const newRow = getNextVisibleRow(
      ctx.activeCell.row,
      'up',
      ctx.hiddenRows,
      maxRows
    );

    if (newRow < ctx.activeCell.row) {
      // Find last visible column
      let lastCol = maxCols - 1;
      while (lastCol > 0 && ctx.hiddenColumns.has(lastCol)) {
        lastCol--;
      }
      return { row: newRow, col: lastCol };
    }

    return ctx.activeCell;
  }

  // Tab - move right, wrap to next row
  const newCol = getNextVisibleColumn(
    ctx.activeCell.col,
    'right',
    ctx.hiddenColumns,
    maxCols
  );

  if (newCol > ctx.activeCell.col) {
    return { row: ctx.activeCell.row, col: newCol };
  }

  // Wrap to next row
  const newRow = getNextVisibleRow(
    ctx.activeCell.row,
    'down',
    ctx.hiddenRows,
    maxRows
  );

  if (newRow > ctx.activeCell.row) {
    // Find first visible column
    let firstCol = 0;
    while (firstCol < maxCols && ctx.hiddenColumns.has(firstCol)) {
      firstCol++;
    }
    return { row: newRow, col: firstCol };
  }

  return ctx.activeCell;
}

/**
 * Navigate based on direction
 */
export function navigate(
  ctx: NavigationContext,
  direction: Direction
): CellAddress | null {
  switch (direction) {
    case 'up':
      return moveUp(ctx);
    case 'down':
      return moveDown(ctx);
    case 'left':
      return moveLeft(ctx);
    case 'right':
      return moveRight(ctx);
    default:
      return ctx.activeCell;
  }
}
