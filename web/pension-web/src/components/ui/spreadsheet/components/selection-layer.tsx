'use client';

/**
 * SelectionLayer Component
 * Overlay rendering selection outlines and fill handle
 */

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { CellAddress, CellRange, Selection } from '../types';
import { normalizeRange } from '../utils/cell-address';

interface SelectionLayerProps {
  selection: Selection;
  columnWidths: number[];
  rowHeights: number[];
  hiddenColumns: Set<number>;
  hiddenRows: Set<number>;
  scrollOffset: { x: number; y: number };
  onFillHandleDrag?: (targetRange: CellRange) => void;
  className?: string;
}

// Calculate position for a cell
function getCellPosition(
  address: CellAddress,
  columnWidths: number[],
  rowHeights: number[],
  hiddenColumns: Set<number>,
  hiddenRows: Set<number>
): { x: number; y: number; width: number; height: number } {
  let x = 0;
  let y = 0;

  // Calculate x position
  for (let col = 0; col < address.col; col++) {
    if (!hiddenColumns.has(col)) {
      x += columnWidths[col] || 100;
    }
  }

  // Calculate y position
  for (let row = 0; row < address.row; row++) {
    if (!hiddenRows.has(row)) {
      y += rowHeights[row] || 28;
    }
  }

  const width = hiddenColumns.has(address.col) ? 0 : (columnWidths[address.col] || 100);
  const height = hiddenRows.has(address.row) ? 0 : (rowHeights[address.row] || 28);

  return { x, y, width, height };
}

// Calculate bounds for a range
function getRangeBounds(
  range: CellRange,
  columnWidths: number[],
  rowHeights: number[],
  hiddenColumns: Set<number>,
  hiddenRows: Set<number>
): { x: number; y: number; width: number; height: number } {
  const normalized = normalizeRange(range);
  const start = getCellPosition(normalized.start, columnWidths, rowHeights, hiddenColumns, hiddenRows);
  const end = getCellPosition(normalized.end, columnWidths, rowHeights, hiddenColumns, hiddenRows);

  return {
    x: start.x,
    y: start.y,
    width: end.x + end.width - start.x,
    height: end.y + end.height - start.y,
  };
}

export function SelectionLayer({
  selection,
  columnWidths,
  rowHeights,
  hiddenColumns,
  hiddenRows,
  scrollOffset,
  onFillHandleDrag,
  className,
}: SelectionLayerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTarget, setDragTarget] = useState<CellAddress | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  // Handle fill handle drag
  const handleFillHandleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);

      let currentDragTarget: CellAddress | null = null;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!layerRef.current) return;

        const rect = layerRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left + scrollOffset.x;
        const y = moveEvent.clientY - rect.top + scrollOffset.y;

        // Find cell at position
        let col = 0;
        let accX = 0;
        for (let i = 0; i < columnWidths.length; i++) {
          if (hiddenColumns.has(i)) continue;
          if (accX + columnWidths[i] > x) {
            col = i;
            break;
          }
          accX += columnWidths[i];
          col = i;
        }

        let row = 0;
        let accY = 0;
        for (let i = 0; i < rowHeights.length; i++) {
          if (hiddenRows.has(i)) continue;
          if (accY + rowHeights[i] > y) {
            row = i;
            break;
          }
          accY += rowHeights[i];
          row = i;
        }

        currentDragTarget = { row, col };
        setDragTarget(currentDragTarget);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        
        if (currentDragTarget && selection.ranges.length > 0) {
          const sourceRange = normalizeRange(selection.ranges[0]);
          const targetRange: CellRange = {
            start: sourceRange.start,
            end: currentDragTarget,
          };
          onFillHandleDrag?.(targetRange);
        }
        
        setDragTarget(null);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [selection.ranges, columnWidths, rowHeights, hiddenColumns, hiddenRows, scrollOffset, onFillHandleDrag]
  );

  if (selection.ranges.length === 0 && !selection.activeCell) {
    return null;
  }

  return (
    <div
      ref={layerRef}
      className={cn('absolute inset-0 pointer-events-none overflow-hidden', className)}
      style={{
        transform: `translate(-${scrollOffset.x}px, -${scrollOffset.y}px)`,
      }}
    >
      {/* Selection ranges */}
      {selection.ranges.map((range, index) => {
        const bounds = getRangeBounds(range, columnWidths, rowHeights, hiddenColumns, hiddenRows);
        
        return (
          <div
            key={index}
            className="absolute border-2 border-primary bg-primary/10"
            style={{
              left: bounds.x,
              top: bounds.y,
              width: bounds.width,
              height: bounds.height,
            }}
          />
        );
      })}

      {/* Active cell highlight */}
      {selection.activeCell && (
        <div
          className="absolute border-2 border-primary ring-1 ring-primary/50"
          style={{
            ...getCellPosition(
              selection.activeCell,
              columnWidths,
              rowHeights,
              hiddenColumns,
              hiddenRows
            ),
            left: getCellPosition(selection.activeCell, columnWidths, rowHeights, hiddenColumns, hiddenRows).x,
            top: getCellPosition(selection.activeCell, columnWidths, rowHeights, hiddenColumns, hiddenRows).y,
          }}
        />
      )}

      {/* Fill handle */}
      {selection.ranges.length > 0 && (
        (() => {
          const lastRange = selection.ranges[selection.ranges.length - 1];
          const bounds = getRangeBounds(lastRange, columnWidths, rowHeights, hiddenColumns, hiddenRows);
          
          return (
            <div
              className={cn(
                'absolute w-2 h-2 bg-primary border border-background cursor-crosshair pointer-events-auto',
                isDragging && 'scale-125'
              )}
              style={{
                left: bounds.x + bounds.width - 4,
                top: bounds.y + bounds.height - 4,
              }}
              onMouseDown={handleFillHandleMouseDown}
            />
          );
        })()
      )}

      {/* Drag preview */}
      {isDragging && dragTarget && selection.ranges.length > 0 && (
        (() => {
          const sourceRange = normalizeRange(selection.ranges[0]);
          const previewRange: CellRange = {
            start: sourceRange.start,
            end: dragTarget,
          };
          const bounds = getRangeBounds(previewRange, columnWidths, rowHeights, hiddenColumns, hiddenRows);
          
          return (
            <div
              className="absolute border-2 border-dashed border-primary/50 bg-primary/5"
              style={{
                left: bounds.x,
                top: bounds.y,
                width: bounds.width,
                height: bounds.height,
              }}
            />
          );
        })()
      )}
    </div>
  );
}
