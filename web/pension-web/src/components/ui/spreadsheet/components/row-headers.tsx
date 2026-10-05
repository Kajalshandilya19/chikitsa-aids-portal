"use client";

/**
 * RowHeaders Component
 * Fixed column with row numbers and resize handles.
 *
 * Virtualized: only renders rows visible in the current scroll viewport
 * (+ small overscan), so thousands of rows stay fast.
 */

import { useRef, useState, useCallback, memo, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSpreadsheetStore } from "../store";

interface RowHeadersProps {
  scrollTop: number;
  className?: string;
  onRowSelect?: (index: number, extend: boolean) => void;
  onRowContextMenu?: (index: number, event: React.MouseEvent) => void;
}

const ROW_HEADER_WIDTH = 50;
const OVERSCAN_PX = 200; // render rows this far outside viewport

const RowHeader = memo(function RowHeader({
  index,
  height,
  isSelected,
  onResize,
  onSelect,
  onContextMenu,
}: {
  index: number;
  height: number;
  isSelected: boolean;
  onResize: (index: number, height: number) => void;
  onSelect: (index: number, extend: boolean) => void;
  onContextMenu: (index: number, event: React.MouseEvent) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startYRef.current = e.clientY;
      startHeightRef.current = height;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const delta = moveEvent.clientY - startYRef.current;
        const newHeight = Math.max(20, startHeightRef.current + delta);
        onResize(index, newHeight);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [index, height, onResize]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
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
        "border-border relative flex items-center justify-center border-r border-b",
        "bg-muted/50 text-muted-foreground text-sm font-medium select-none",
        "hover:bg-muted transition-colors",
        isSelected && "bg-primary/20 text-primary"
      )}
      style={{ width: ROW_HEADER_WIDTH, height, minHeight: height }}
      onClick={handleClick}
      onContextMenu={handleContextMenuEvent}
    >
      {index + 1}

      {/* Resize handle */}
      <div
        className={cn(
          "absolute right-0 bottom-0 left-0 h-1 cursor-row-resize",
          "hover:bg-primary/50 transition-colors",
          isResizing && "bg-primary"
        )}
        onMouseDown={handleMouseDown}
      />
    </div>
  );
});

export function RowHeaders({
  scrollTop,
  className,
  onRowSelect,
  onRowContextMenu,
}: RowHeadersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rowHeights = useSpreadsheetStore((state) => state.rowHeights);
  const hiddenRows = useSpreadsheetStore((state) => state.hiddenRows);
  const selection = useSpreadsheetStore((state) => state.selection);
  const setRowHeight = useSpreadsheetStore((state) => state.setRowHeight);
  const [viewportHeight, setViewportHeight] = useState(800);

  // Track the visible height so only on-screen rows are rendered
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight || 800);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Get selected rows from selection
  const selectedRows = useMemo(() => {
    const set = new Set<number>();
    for (const range of selection.ranges) {
      const minRow = Math.min(range.start.row, range.end.row);
      const maxRow = Math.max(range.start.row, range.end.row);
      for (let row = minRow; row <= maxRow; row++) {
        set.add(row);
      }
    }
    return set;
  }, [selection.ranges]);

  // Build cumulative offsets for visible rows and compute windowed items
  const { totalHeight, visibleItems } = useMemo(() => {
    const viewTop = scrollTop - OVERSCAN_PX;
    const viewBottom = scrollTop + viewportHeight + OVERSCAN_PX;

    const items: Array<{ index: number; top: number; height: number }> = [];
    let top = 0;
    let totalH = 0;

    for (let i = 0; i < rowHeights.length; i++) {
      if (hiddenRows.has(i)) continue;
      const h = rowHeights[i] || 28;
      totalH += h;

      // Only materialize rows that overlap the viewport (with overscan)
      if (top + h >= viewTop && top <= viewBottom) {
        items.push({ index: i, top, height: h });
      }
      top += h;
    }

    return { totalHeight: totalH, visibleItems: items };
  }, [rowHeights, hiddenRows, scrollTop, viewportHeight]);

  const handleSelect = useCallback(
    (index: number, extend: boolean) => {
      onRowSelect?.(index, extend);
    },
    [onRowSelect]
  );

  const handleContextMenu = useCallback(
    (index: number, event: React.MouseEvent) => {
      onRowContextMenu?.(index, event);
    },
    [onRowContextMenu]
  );

  return (
    <div
      ref={containerRef}
      className={cn("bg-muted/30 overflow-hidden", className)}
      style={{ width: ROW_HEADER_WIDTH }}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {visibleItems.map(({ index, top, height }) => (
          <div
            key={index}
            className="absolute left-0"
            style={{ top: top - scrollTop, width: ROW_HEADER_WIDTH, height }}
          >
            <RowHeader
              index={index}
              height={height}
              isSelected={selectedRows.has(index)}
              onResize={setRowHeight}
              onSelect={handleSelect}
              onContextMenu={handleContextMenu}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export { ROW_HEADER_WIDTH };
