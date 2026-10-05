"use client";

/**
 * Spreadsheet Component
 * Main container that composes all sub-components: virtualized grid, column
 * and row headers, selection overlay with fill handle, inline cell editor,
 * keyboard navigation, clipboard and context menus.
 */

import { useRef, useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSpreadsheetStore } from "../store";
import { SpreadsheetGrid } from "./spreadsheet-grid";
import { ColumnHeaders } from "./column-headers";
import { RowHeaders, ROW_HEADER_WIDTH } from "./row-headers";
import { SelectionLayer } from "./selection-layer";
import { CellEditor } from "./cell-editor";
import { ColumnContextMenu, RowContextMenu, CellContextMenu } from "./context-menus";
import type { CellAddress, CellRange, ValidationMessageKey } from "../types";
import {
  navigate,
  moveToRowStart,
  moveToRowEnd,
  moveToDataEdge,
  pageUp,
  pageDown,
  tab,
} from "../utils/navigation";
import {
  copyToClipboard,
  cutToClipboard,
  pasteFromClipboard,
  hasPendingCut,
  getCutSourceRange,
  clearCutOperation,
} from "../utils/clipboard";
import { normalizeRange } from "../utils/cell-address";
import { cellValueToString, parseInputValue } from "../utils/formatters";

interface SpreadsheetProps {
  className?: string;
  readOnly?: boolean;
  /** When false, columns cannot be inserted or deleted (fixed column layouts). Default true. */
  allowColumnEdits?: boolean;
  /** When true, row 0 is a header: it cannot be deleted or hidden and no row can go above it. */
  lockHeaderRow?: boolean;
}

const COLUMN_HEADER_HEIGHT = 28;

type MenuState = { index: number; position: { x: number; y: number } } | null;

export function Spreadsheet({
  className,
  readOnly = false,
  allowColumnEdits = true,
  lockHeaderRow = false,
}: SpreadsheetProps) {
  const t = useTranslations("spreadsheet");
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollOffset, setScrollOffset] = useState({ x: 0, y: 0 });
  const [columnContextMenu, setColumnContextMenu] = useState<MenuState>(null);
  const [rowContextMenu, setRowContextMenu] = useState<MenuState>(null);
  const [cellContextMenu, setCellContextMenu] = useState<{
    position: { x: number; y: number };
  } | null>(null);

  // Store state
  const data = useSpreadsheetStore((state) => state.data);
  const columnWidths = useSpreadsheetStore((state) => state.columnWidths);
  const rowHeights = useSpreadsheetStore((state) => state.rowHeights);
  const hiddenColumns = useSpreadsheetStore((state) => state.hiddenColumns);
  const hiddenRows = useSpreadsheetStore((state) => state.hiddenRows);
  const selection = useSpreadsheetStore((state) => state.selection);
  const editingCell = useSpreadsheetStore((state) => state.editingCell);

  // Store actions
  const selectCell = useSpreadsheetStore((state) => state.selectCell);
  const extendSelection = useSpreadsheetStore((state) => state.extendSelection);
  const addToSelection = useSpreadsheetStore((state) => state.addToSelection);
  const startEditing = useSpreadsheetStore((state) => state.startEditing);
  const commitEdit = useSpreadsheetStore((state) => state.commitEdit);
  const cancelEdit = useSpreadsheetStore((state) => state.cancelEdit);
  const batchSetCellValues = useSpreadsheetStore((state) => state.batchSetCellValues);
  const ensureRows = useSpreadsheetStore((state) => state.ensureRows);
  const insertRow = useSpreadsheetStore((state) => state.insertRow);
  const deleteRow = useSpreadsheetStore((state) => state.deleteRow);
  const insertColumn = useSpreadsheetStore((state) => state.insertColumn);
  const deleteColumn = useSpreadsheetStore((state) => state.deleteColumn);
  const hideColumn = useSpreadsheetStore((state) => state.hideColumn);
  const showColumn = useSpreadsheetStore((state) => state.showColumn);
  const hideRow = useSpreadsheetStore((state) => state.hideRow);
  const showRow = useSpreadsheetStore((state) => state.showRow);
  const undo = useSpreadsheetStore((state) => state.undo);
  const redo = useSpreadsheetStore((state) => state.redo);
  const getSelectedCells = useSpreadsheetStore((state) => state.getSelectedCells);
  const setTranslator = useSpreadsheetStore((state) => state.setTranslator);

  // Built-in validation messages come from the "spreadsheet.validation" namespace
  useEffect(() => {
    setTranslator((key: ValidationMessageKey, values) => t(`validation.${key}`, values));
  }, [t, setTranslator]);

  const getNavigationContext = useCallback(
    () => ({
      data,
      hiddenRows,
      hiddenColumns,
      activeCell: selection.activeCell,
      viewportRows: Math.floor(400 / 28), // Approximate viewport rows
    }),
    [data, hiddenRows, hiddenColumns, selection.activeCell],
  );

  const handleCellClick = useCallback(
    (address: CellAddress, ctrlKey?: boolean, shiftKey?: boolean) => {
      if (editingCell) {
        // Commit the live edit value (typed but not yet committed)
        const pending = useSpreadsheetStore.getState().pendingEditValue;
        commitEdit(pending ?? cellValueToString(data[editingCell.row]?.[editingCell.col]?.value));
      }

      if (shiftKey && selection.activeCell) {
        extendSelection(address);
      } else if (ctrlKey) {
        addToSelection(address);
      } else {
        // Clicking inside the current selection keeps it and only moves the active cell
        const isAlreadySelected = selection.ranges.some((range) => {
          const n = normalizeRange(range);
          return (
            address.row >= n.start.row &&
            address.row <= n.end.row &&
            address.col >= n.start.col &&
            address.col <= n.end.col
          );
        });

        if (isAlreadySelected) {
          useSpreadsheetStore.setState({ selection: { ...selection, activeCell: address } });
        } else {
          selectCell(address);
        }
      }

      containerRef.current?.focus();
    },
    [editingCell, commitEdit, data, selectCell, addToSelection, extendSelection, selection],
  );

  const handleCellDoubleClick = useCallback(
    (address: CellAddress) => {
      if (!readOnly) startEditing(address);
    },
    [readOnly, startEditing],
  );

  const handleScroll = useCallback((scrollTop: number, scrollLeft: number) => {
    setScrollOffset({ x: scrollLeft, y: scrollTop });
  }, []);

  const clearSelectedCells = useCallback(() => {
    const cells = getSelectedCells();
    batchSetCellValues(cells.map((c) => ({ row: c.row, col: c.col, value: null })));
  }, [getSelectedCells, batchSetCellValues]);

  const handlePaste = useCallback(async () => {
    const active = selection.activeCell;
    if (!active || readOnly) return;

    const pasteData = await pasteFromClipboard(active);
    if (!pasteData) {
      toast.error(t("nothingToPaste"));
      return;
    }

    const { cells } = pasteData;
    const startRow = active.row;
    const startCol = active.col;

    // Grow the grid so pasted rows past the end are not dropped
    ensureRows(startRow + cells.length);
    const grid = useSpreadsheetStore.getState().data;
    const cols = grid[0]?.length || 0;

    const updates: Array<{ row: number; col: number; value: unknown }> = [];
    for (let r = 0; r < cells.length; r++) {
      for (let c = 0; c < cells[r].length; c++) {
        const targetRow = startRow + r;
        const targetCol = startCol + c;
        if (targetRow < grid.length && targetCol < cols) {
          const type = grid[targetRow]?.[targetCol]?.type ?? "text";
          updates.push({
            row: targetRow,
            col: targetCol,
            value: parseInputValue(cells[r][c], type),
          });
        }
      }
    }

    // A cut also clears the source cells in the same batch
    if (hasPendingCut()) {
      const sourceRange = getCutSourceRange();
      if (sourceRange) {
        const n = normalizeRange(sourceRange);
        const pasted = new Set(updates.map((u) => `${u.row},${u.col}`));
        for (let r = n.start.row; r <= n.end.row; r++) {
          for (let c = n.start.col; c <= n.end.col; c++) {
            if (!pasted.has(`${r},${c}`)) updates.push({ row: r, col: c, value: null });
          }
        }
      }
      clearCutOperation();
    }

    batchSetCellValues(updates);
    toast.success(t("pasted"));
  }, [selection.activeCell, readOnly, ensureRows, batchSetCellValues, t]);

  const handleCopy = useCallback(() => {
    if (selection.ranges.length > 0) {
      void copyToClipboard(data, selection.ranges[0]);
      toast.success(t("copied"));
    }
  }, [selection.ranges, data, t]);

  const handleCut = useCallback(() => {
    if (selection.ranges.length > 0 && !readOnly) {
      void cutToClipboard(data, selection.ranges[0]);
      toast.success(t("cutDone"));
    }
  }, [selection.ranges, data, readOnly, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const ctx = getNavigationContext();
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

      // While editing, the editor handles keys
      if (editingCell && !ctrlKey) return;

      // Clipboard and history shortcuts
      if (ctrlKey && !editingCell) {
        switch (e.key.toLowerCase()) {
          case "c":
            e.preventDefault();
            handleCopy();
            return;
          case "x":
            e.preventDefault();
            handleCut();
            return;
          case "v":
            e.preventDefault();
            void handlePaste();
            return;
          case "z":
            e.preventDefault();
            if (readOnly) return;
            if (e.shiftKey) redo();
            else undo();
            return;
          case "y":
            e.preventDefault();
            if (!readOnly) redo();
            return;
        }
      }
      if (editingCell) return;

      let newCell: CellAddress | null = null;
      const extend = e.shiftKey;

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          newCell = ctrlKey ? moveToDataEdge(ctx, "up") : navigate(ctx, "up");
          break;
        case "ArrowDown":
          e.preventDefault();
          newCell = ctrlKey ? moveToDataEdge(ctx, "down") : navigate(ctx, "down");
          break;
        case "ArrowLeft":
          e.preventDefault();
          newCell = ctrlKey ? moveToDataEdge(ctx, "left") : navigate(ctx, "left");
          break;
        case "ArrowRight":
          e.preventDefault();
          newCell = ctrlKey ? moveToDataEdge(ctx, "right") : navigate(ctx, "right");
          break;
        case "Tab":
          e.preventDefault();
          newCell = tab(ctx, e.shiftKey);
          break;
        case "Enter":
          e.preventDefault();
          if (selection.activeCell && !readOnly) {
            startEditing(selection.activeCell);
          } else {
            newCell = e.shiftKey ? navigate(ctx, "up") : navigate(ctx, "down");
          }
          break;
        case "Home":
          e.preventDefault();
          newCell = moveToRowStart(ctx);
          break;
        case "End":
          e.preventDefault();
          newCell = moveToRowEnd(ctx);
          break;
        case "PageUp":
          e.preventDefault();
          newCell = pageUp(ctx);
          break;
        case "PageDown":
          e.preventDefault();
          newCell = pageDown(ctx);
          break;
        case "Escape":
          return;
        case "Delete":
        case "Backspace":
          if (!readOnly) {
            e.preventDefault();
            clearSelectedCells();
          }
          return;
        case "F2":
          if (selection.activeCell && !readOnly) {
            e.preventDefault();
            startEditing(selection.activeCell);
          }
          return;
        default:
          // Start editing on any printable character (it lands in the editor)
          if (selection.activeCell && !readOnly && e.key.length === 1 && !ctrlKey && !e.altKey) {
            startEditing(selection.activeCell);
          }
          return;
      }

      if (newCell) {
        // Shift+Arrow extends the selection from its anchor
        if (extend && e.key !== "Tab" && e.key !== "Enter") extendSelection(newCell);
        else selectCell(newCell);
        containerRef.current?.focus();
      }
    },
    [
      getNavigationContext,
      editingCell,
      selection.activeCell,
      readOnly,
      handleCopy,
      handleCut,
      handlePaste,
      undo,
      redo,
      startEditing,
      selectCell,
      extendSelection,
      clearSelectedCells,
    ],
  );

  // Fill handle: repeat the source block over the dragged range (one batch)
  const handleFillHandleDrag = useCallback(
    (targetRange: CellRange) => {
      if (readOnly || selection.ranges.length === 0) return;

      const sourceRange = normalizeRange(selection.ranges[0]);
      const n = normalizeRange(targetRange);
      const srcRows = sourceRange.end.row - sourceRange.start.row + 1;
      const srcCols = sourceRange.end.col - sourceRange.start.col + 1;
      const updates: Array<{ row: number; col: number; value: unknown }> = [];

      for (let r = n.start.row; r <= n.end.row; r++) {
        for (let c = n.start.col; c <= n.end.col; c++) {
          if (
            r >= sourceRange.start.row &&
            r <= sourceRange.end.row &&
            c >= sourceRange.start.col &&
            c <= sourceRange.end.col
          ) {
            continue;
          }
          const dr = (((r - sourceRange.start.row) % srcRows) + srcRows) % srcRows;
          const dc = (((c - sourceRange.start.col) % srcCols) + srcCols) % srcCols;
          const sourceCell = data[sourceRange.start.row + dr]?.[sourceRange.start.col + dc];
          if (sourceCell) updates.push({ row: r, col: c, value: sourceCell.value });
        }
      }
      batchSetCellValues(updates);
    },
    [readOnly, selection.ranges, data, batchSetCellValues],
  );

  const handleCellContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCellContextMenu({ position: { x: e.clientX, y: e.clientY } });
  }, []);

  // Editor position and value
  const editorProps = (() => {
    if (!editingCell) return null;
    const cell = data[editingCell.row]?.[editingCell.col];
    if (!cell) return null;

    let x = 0;
    for (let c = 0; c < editingCell.col; c++) {
      if (!hiddenColumns.has(c)) x += columnWidths[c] || 100;
    }
    let y = 0;
    for (let r = 0; r < editingCell.row; r++) {
      if (!hiddenRows.has(r)) y += rowHeights[r] || 28;
    }

    return {
      cellKey: `${editingCell.row},${editingCell.col}`,
      value: cellValueToString(cell.value),
      cellType: cell.type,
      validation: cell.validation,
      dropdownOptions: cell.validation?.options,
      disabled: cell.disabled,
      style: {
        left: x - scrollOffset.x,
        top: y - scrollOffset.y,
        width: columnWidths[editingCell.col] || 100,
        height: rowHeights[editingCell.row] || 28,
      },
    };
  })();

  const closeRowMenu = () => setRowContextMenu(null);
  const closeColumnMenu = () => setColumnContextMenu(null);
  const rowMenuIsHeader = lockHeaderRow && rowContextMenu?.index === 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "border-border bg-background relative flex flex-col overflow-hidden rounded-md border",
        "focus:ring-ring focus:ring-2 focus:outline-none",
        className,
      )}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={handleCellContextMenu}
    >
      {/* Header row */}
      <div className="flex" style={{ height: COLUMN_HEADER_HEIGHT }}>
        {/* Corner cell */}
        <div
          className="border-border bg-muted/50 flex items-center justify-center border-r border-b"
          style={{ width: ROW_HEADER_WIDTH, height: COLUMN_HEADER_HEIGHT }}
        />
        <div className="flex-1 overflow-hidden">
          <ColumnHeaders
            scrollLeft={scrollOffset.x}
            onColumnSelect={(index, extend) => {
              if (extend && selection.activeCell) {
                extendSelection({ row: data.length - 1, col: index });
              } else {
                selectCell({ row: 0, col: index });
                extendSelection({ row: data.length - 1, col: index });
              }
            }}
            onColumnContextMenu={(index, event) => {
              event.stopPropagation();
              setColumnContextMenu({ index, position: { x: event.clientX, y: event.clientY } });
            }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <RowHeaders
          scrollTop={scrollOffset.y}
          onRowSelect={(index, extend) => {
            const cols = data[0]?.length || 0;
            if (extend && selection.activeCell) {
              extendSelection({ row: index, col: cols - 1 });
            } else {
              selectCell({ row: index, col: 0 });
              extendSelection({ row: index, col: cols - 1 });
            }
          }}
          onRowContextMenu={(index, event) => {
            event.stopPropagation();
            if (readOnly) return;
            setRowContextMenu({ index, position: { x: event.clientX, y: event.clientY } });
          }}
        />

        <div className="relative flex-1 overflow-hidden">
          <SpreadsheetGrid
            className="h-full"
            onCellClick={handleCellClick}
            onCellDoubleClick={handleCellDoubleClick}
            onScroll={handleScroll}
          />

          <SelectionLayer
            selection={selection}
            columnWidths={columnWidths}
            rowHeights={rowHeights}
            hiddenColumns={hiddenColumns}
            hiddenRows={hiddenRows}
            scrollOffset={scrollOffset}
            onFillHandleDrag={handleFillHandleDrag}
          />

          {editorProps && (
            <CellEditor
              key={editorProps.cellKey}
              value={editorProps.value}
              cellType={editorProps.cellType}
              validation={editorProps.validation}
              dropdownOptions={editorProps.dropdownOptions}
              disabled={editorProps.disabled}
              style={editorProps.style}
              onCommit={(value) => {
                commitEdit(value);
                containerRef.current?.focus();
              }}
              onCancel={() => {
                cancelEdit();
                containerRef.current?.focus();
              }}
              onNavigate={(direction) => {
                const newCell = navigate(getNavigationContext(), direction);
                if (newCell) selectCell(newCell);
                containerRef.current?.focus();
              }}
            />
          )}
        </div>
      </div>

      {/* Context menus */}
      <ColumnContextMenu
        columnIndex={columnContextMenu?.index ?? 0}
        position={columnContextMenu?.position ?? null}
        isHidden={hiddenColumns.has(columnContextMenu?.index ?? 0)}
        allowInsertDelete={allowColumnEdits && !readOnly}
        onClose={closeColumnMenu}
        onInsertLeft={() => {
          if (columnContextMenu) insertColumn(columnContextMenu.index, "before");
          closeColumnMenu();
        }}
        onInsertRight={() => {
          if (columnContextMenu) insertColumn(columnContextMenu.index, "after");
          closeColumnMenu();
        }}
        onDelete={() => {
          if (columnContextMenu) deleteColumn(columnContextMenu.index);
          closeColumnMenu();
        }}
        onHide={() => {
          if (columnContextMenu) hideColumn(columnContextMenu.index);
          closeColumnMenu();
        }}
        onShow={() => {
          if (columnContextMenu) showColumn(columnContextMenu.index);
          closeColumnMenu();
        }}
      />

      <RowContextMenu
        rowIndex={rowContextMenu?.index ?? 0}
        position={rowContextMenu?.position ?? null}
        isHidden={hiddenRows.has(rowContextMenu?.index ?? 0)}
        allowInsertAbove={!rowMenuIsHeader}
        allowDelete={!rowMenuIsHeader}
        onClose={closeRowMenu}
        onInsertAbove={() => {
          if (rowContextMenu) insertRow(rowContextMenu.index, "before");
          closeRowMenu();
        }}
        onInsertBelow={() => {
          if (rowContextMenu) insertRow(rowContextMenu.index, "after");
          closeRowMenu();
        }}
        onDelete={() => {
          if (rowContextMenu) deleteRow(rowContextMenu.index);
          closeRowMenu();
        }}
        onHide={() => {
          if (rowContextMenu) hideRow(rowContextMenu.index);
          closeRowMenu();
        }}
        onShow={() => {
          if (rowContextMenu) showRow(rowContextMenu.index);
          closeRowMenu();
        }}
      />

      <CellContextMenu
        position={cellContextMenu?.position ?? null}
        readOnly={readOnly}
        onClose={() => setCellContextMenu(null)}
        onCopy={() => {
          handleCopy();
          setCellContextMenu(null);
        }}
        onCut={() => {
          handleCut();
          setCellContextMenu(null);
        }}
        onPaste={() => {
          void handlePaste();
          setCellContextMenu(null);
        }}
        onClear={() => {
          if (!readOnly) clearSelectedCells();
          setCellContextMenu(null);
        }}
      />
    </div>
  );
}
