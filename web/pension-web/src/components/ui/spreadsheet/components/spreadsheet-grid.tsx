"use client";

/**
 * SpreadsheetGrid Component
 * Virtualized grid renderer using @tanstack/react-virtual
 */

import { useRef, useCallback, memo, useMemo, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import type { CellAddress, CellData } from "../types";
import { useSpreadsheetStore } from "../store";
import type { SortDirection } from "../store";
import { cn } from "@/lib/utils";
import { isInRange, normalizeRange } from "../utils/cell-address";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface SpreadsheetGridProps {
  className?: string;
  onCellClick?: (address: CellAddress, ctrlKey?: boolean, shiftKey?: boolean) => void;
  onCellDoubleClick?: (address: CellAddress) => void;
  onScroll?: (scrollTop: number, scrollLeft: number) => void;
}

const EMPTY_CELL: CellData = { value: null, displayValue: "", type: "text" };

// Memoized cell component
const Cell = memo(function Cell({
  rowIndex,
  colIndex,
  cell,
  width,
  height,
  isSelected,
  isActive,
  isEditing,
  sortDirection,
  yesLabel,
  noLabel,
  onClick,
  onDoubleClick,
  onSort,
}: {
  rowIndex: number;
  colIndex: number;
  cell: CellData;
  width: number;
  height: number;
  isSelected: boolean;
  isActive: boolean;
  isEditing: boolean;
  sortDirection?: SortDirection;
  yesLabel: string;
  noLabel: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onSort?: () => void;
}) {
  const isHeaderRow = rowIndex === 0 && cell.disabled;

  return (
    <div
      className={cn(
        "relative box-border flex cursor-cell items-center truncate px-2",
        "border-border border-r border-b",
        "transition-colors duration-75",
        "hover:bg-accent/30",
        isSelected && !isActive && "bg-primary/10",
        isActive && "bg-primary/20",
        isEditing && "invisible", // Hide cell content when editing
        cell.error && "bg-destructive/10",
        cell.disabled && !isHeaderRow && "bg-muted cursor-not-allowed opacity-50",
        isHeaderRow && "bg-muted/50 hover:bg-muted cursor-pointer",
        cell.style?.textAlign === "center" && "justify-center",
        cell.style?.textAlign === "right" && "justify-end",
        cell.style?.fontWeight === "bold" && "font-bold",
        cell.style?.fontStyle === "italic" && "italic",
        cell.style?.textDecoration === "underline" && "underline",
        cell.style?.textDecoration === "line-through" && "line-through",
      )}
      style={{
        width,
        height,
        minWidth: width,
        backgroundColor: cell.style?.backgroundColor,
        color: cell.style?.textColor,
      }}
      onClick={isHeaderRow ? onSort : cell.disabled ? undefined : onClick}
      onDoubleClick={cell.disabled ? undefined : onDoubleClick}
      data-row={rowIndex}
      data-col={colIndex}
    >
      {cell.type === "boolean" ? (
        <span className="truncate">
          {cell.value === null || cell.value === undefined || cell.value === ""
            ? ""
            : cell.value === true || cell.value === "true"
              ? yesLabel
              : cell.value === false || cell.value === "false"
                ? noLabel
                : String(cell.value)}
        </span>
      ) : (
        <span className="truncate">{cell.displayValue ?? String(cell.value ?? "")}</span>
      )}
      {isHeaderRow && sortDirection && (
        <span className="text-muted-foreground ml-1 shrink-0 text-[10px] leading-none" aria-hidden>
          {sortDirection === "asc" ? "▲" : "▼"}
        </span>
      )}
      {cell.error && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute top-0 right-0 h-3 w-3 cursor-help" aria-label={cell.error}>
              <div className="border-t-destructive absolute top-0 right-0 h-0 w-0 border-t-4 border-r-4 border-r-transparent" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-destructive text-destructive-foreground max-w-xs whitespace-pre-line">
            {cell.error}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});

export function SpreadsheetGrid({
  className,
  onCellClick,
  onCellDoubleClick,
  onScroll,
}: SpreadsheetGridProps) {
  const t = useTranslations("spreadsheet");
  const yesLabel = t("yes");
  const noLabel = t("no");
  const containerRef = useRef<HTMLDivElement>(null);

  const data = useSpreadsheetStore((state) => state.data);
  const columnWidths = useSpreadsheetStore((state) => state.columnWidths);
  const rowHeights = useSpreadsheetStore((state) => state.rowHeights);
  const hiddenRows = useSpreadsheetStore((state) => state.hiddenRows);
  const hiddenColumns = useSpreadsheetStore((state) => state.hiddenColumns);
  const selection = useSpreadsheetStore((state) => state.selection);
  const editingCell = useSpreadsheetStore((state) => state.editingCell);
  const sortState = useSpreadsheetStore((state) => state.sortState);
  const sortByColumn = useSpreadsheetStore((state) => state.sortByColumn);

  // Filter out hidden rows and columns
  const visibleRowIndices = useMemo(
    () => data.map((_, i) => i).filter((i) => !hiddenRows.has(i)),
    [data, hiddenRows],
  );

  const visibleColIndices = useMemo(
    () => columnWidths.map((_, i) => i).filter((i) => !hiddenColumns.has(i)),
    [columnWidths, hiddenColumns],
  );

  // Row virtualizer
  const rowVirtualizer = useVirtualizer({
    count: visibleRowIndices.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => rowHeights[visibleRowIndices[index]] || 28,
    overscan: 5,
  });

  // Column virtualizer
  const columnVirtualizer = useVirtualizer({
    count: visibleColIndices.length,
    getScrollElement: () => containerRef.current,
    estimateSize: (index) => columnWidths[visibleColIndices[index]] || 100,
    horizontal: true,
    overscan: 3,
  });

  // Re-measure when column widths change
  useEffect(() => {
    columnVirtualizer.measure();
  }, [columnWidths, columnVirtualizer]);

  // Re-measure when row heights change
  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowHeights, rowVirtualizer]);

  const isCellSelected = useCallback(
    (address: CellAddress): boolean =>
      selection.ranges.some((range) => isInRange(address, normalizeRange(range))),
    [selection.ranges],
  );

  const activeCell = selection.activeCell;
  const isCellActive = useCallback(
    (address: CellAddress): boolean =>
      activeCell?.row === address.row && activeCell?.col === address.col,
    [activeCell],
  );

  const handleScroll = useCallback(() => {
    if (containerRef.current && onScroll) {
      onScroll(containerRef.current.scrollTop, containerRef.current.scrollLeft);
    }
  }, [onScroll]);

  const virtualRows = rowVirtualizer.getVirtualItems();
  const virtualCols = columnVirtualizer.getVirtualItems();

  return (
    <div ref={containerRef} className={cn("relative overflow-auto", className)} onScroll={handleScroll}>
      <div
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: columnVirtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {/* Sticky header row (row 0): stays visible on vertical scroll and
            scrolls horizontally with the body via the same column virtualizer. */}
        {data[0] && !hiddenRows.has(0) && (
          <div
            className="bg-background sticky top-0 z-20"
            style={{ height: rowHeights[0] || 28, width: columnVirtualizer.getTotalSize() }}
          >
            {virtualCols.map((virtualCol) => {
              const colIndex = visibleColIndices[virtualCol.index];
              const cell = data[0]?.[colIndex] || EMPTY_CELL;
              const width = columnWidths[colIndex] || 100;
              const height = rowHeights[0] || 28;
              const address: CellAddress = { row: 0, col: colIndex };
              return (
                <div
                  key={virtualCol.key}
                  className="absolute top-0"
                  style={{ left: virtualCol.start, width, height }}
                >
                  <Cell
                    rowIndex={0}
                    colIndex={colIndex}
                    cell={cell}
                    width={width}
                    height={height}
                    isSelected={isCellSelected(address)}
                    isActive={isCellActive(address)}
                    isEditing={editingCell?.row === 0 && editingCell?.col === colIndex}
                    sortDirection={sortState?.column === colIndex ? sortState.direction : undefined}
                    yesLabel={yesLabel}
                    noLabel={noLabel}
                    onClick={(e) => onCellClick?.(address, e.ctrlKey || e.metaKey, e.shiftKey)}
                    onDoubleClick={() => onCellDoubleClick?.(address)}
                    onSort={() => sortByColumn(colIndex)}
                  />
                </div>
              );
            })}
          </div>
        )}

        {virtualRows.map((virtualRow) => {
          const rowIndex = visibleRowIndices[virtualRow.index];
          // Row 0 is drawn by the sticky header above.
          if (rowIndex === 0) return null;
          const rowData = data[rowIndex];
          const rowHeight = rowHeights[rowIndex] || 28;

          return (
            <div
              key={virtualRow.key}
              className="absolute flex"
              style={{ top: virtualRow.start, height: rowHeight }}
            >
              {virtualCols.map((virtualCol) => {
                const colIndex = visibleColIndices[virtualCol.index];
                const cell = rowData?.[colIndex] || EMPTY_CELL;
                const width = columnWidths[colIndex] || 100;
                const address: CellAddress = { row: rowIndex, col: colIndex };

                return (
                  <div
                    key={virtualCol.key}
                    className="absolute"
                    style={{ left: virtualCol.start, width, height: rowHeight }}
                  >
                    <Cell
                      rowIndex={rowIndex}
                      colIndex={colIndex}
                      cell={cell}
                      width={width}
                      height={rowHeight}
                      isSelected={isCellSelected(address)}
                      isActive={isCellActive(address)}
                      isEditing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
                      yesLabel={yesLabel}
                      noLabel={noLabel}
                      onClick={(e) => onCellClick?.(address, e.ctrlKey || e.metaKey, e.shiftKey)}
                      onDoubleClick={() => onCellDoubleClick?.(address)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
