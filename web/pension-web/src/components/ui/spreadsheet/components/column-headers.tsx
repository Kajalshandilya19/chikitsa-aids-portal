'use client';

/**
 * ColumnHeaders Component
 * Fixed header row with column labels and resize handles
 */

import { useRef, useState, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { columnIndexToLetter } from '../utils/column';
import { useSpreadsheetStore } from '../store';

interface ColumnHeadersProps {
  scrollLeft: number;
  className?: string;
  onColumnSelect?: (index: number, extend: boolean) => void;
  onColumnContextMenu?: (index: number, event: React.MouseEvent) => void;
}

const ColumnHeader = memo(function ColumnHeader({
  index,
  width,
  isSelected,
  onResize,
  onSelect,
  onContextMenu,
  onAutoFit,
}: {
  index: number;
  width: number;
  isSelected: boolean;
  onResize: (index: number, width: number) => void;
  onSelect: (index: number, extend: boolean) => void;
  onContextMenu: (index: number, event: React.MouseEvent) => void;
  onAutoFit: (index: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = width;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientX - startXRef.current;
        const newWidth = Math.max(30, startWidthRef.current + delta);
        onResize(index, newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [index, width, onResize]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onAutoFit(index);
    },
    [index, onAutoFit]
  );

  const handleHeaderMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Prevent text selection on shift+click
      e.preventDefault();
      onSelect(index, e.shiftKey);
    },
    [index, onSelect]
  );

  const handleContextMenuEvent = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onContextMenu(index, e);
    },
    [index, onContextMenu]
  );

  return (
    <div
      className={cn(
        'relative flex items-center justify-center border-r border-b border-border',
        'bg-muted/50 text-muted-foreground text-sm font-medium select-none',
        'hover:bg-muted transition-colors',
        isSelected && 'bg-primary/20 text-primary'
      )}
      style={{ width, minWidth: width, height: 28 }}
      onMouseDown={handleHeaderMouseDown}
      onContextMenu={handleContextMenuEvent}
    >
      {columnIndexToLetter(index)}

      {/* Resize handle */}
      <div
        className={cn(
          'absolute right-0 top-0 bottom-0 w-1 cursor-col-resize',
          'hover:bg-primary/50 transition-colors',
          isResizing && 'bg-primary'
        )}
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
});

export function ColumnHeaders({
  scrollLeft,
  className,
  onColumnSelect,
  onColumnContextMenu,
}: ColumnHeadersProps) {
  const columnWidths = useSpreadsheetStore((state) => state.columnWidths);
  const hiddenColumns = useSpreadsheetStore((state) => state.hiddenColumns);
  const selection = useSpreadsheetStore((state) => state.selection);
  const setColumnWidth = useSpreadsheetStore((state) => state.setColumnWidth);
  const data = useSpreadsheetStore((state) => state.data);

  // Get selected columns from selection
  const selectedColumns = new Set<number>();
  for (const range of selection.ranges) {
    const minCol = Math.min(range.start.col, range.end.col);
    const maxCol = Math.max(range.start.col, range.end.col);
    for (let col = minCol; col <= maxCol; col++) {
      selectedColumns.add(col);
    }
  }

  // Auto-fit column width based on content
  const handleAutoFit = useCallback(
    (index: number) => {
      // Calculate max content width (simplified - in real app would measure text)
      let maxWidth = 50;
      for (const row of data) {
        const cell = row[index];
        if (cell?.displayValue) {
          // Rough estimate: 8px per character
          const contentWidth = cell.displayValue.length * 8 + 16;
          maxWidth = Math.max(maxWidth, contentWidth);
        }
      }
      setColumnWidth(index, Math.min(maxWidth, 300));
    },
    [data, setColumnWidth]
  );

  const handleSelect = useCallback(
    (index: number, extend: boolean) => {
      onColumnSelect?.(index, extend);
    },
    [onColumnSelect]
  );

  const handleContextMenu = useCallback(
    (index: number, event: React.MouseEvent) => {
      onColumnContextMenu?.(index, event);
    },
    [onColumnContextMenu]
  );

  // Calculate total width
  const totalWidth = columnWidths.reduce((sum, w, i) => {
    if (hiddenColumns.has(i)) return sum;
    return sum + w;
  }, 0);

  return (
    <div
      className={cn('flex overflow-hidden bg-muted/30', className)}
      style={{ height: 28 }}
    >
      <div
        className="flex"
        style={{
          transform: `translateX(-${scrollLeft}px)`,
          width: totalWidth,
        }}
      >
        {columnWidths.map((width, index) => {
          if (hiddenColumns.has(index)) return null;
          
          return (
            <ColumnHeader
              key={index}
              index={index}
              width={width}
              isSelected={selectedColumns.has(index)}
              onResize={setColumnWidth}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
              onAutoFit={handleAutoFit}
            />
          );
        })}
      </div>
    </div>
  );
}
