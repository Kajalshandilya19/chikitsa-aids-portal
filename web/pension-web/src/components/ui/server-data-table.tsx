"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type SortingState,
  type Updater,
  type VisibilityState,
} from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { IconAlertCircleFilled as AlertCircle, IconInbox as Inbox, IconRefresh as RefreshCw, IconSearch as Search, IconFileSearch as SearchX, IconX as X } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { DataTableViewOptions } from "@/components/ui/data-table-column-toggle";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ServerDataTablePagination } from "@/components/ui/server-data-table-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

/**
 * Server-paged table (paging, sorting and search happen in the service). Pair it with
 * `useServerTable` (src/hooks/use-server-table.ts), which owns the query and spreads `tableProps`.
 *
 * Column visibility, density and widths are kept in memory for the life of the page only: nothing
 * about a table is written to the browser's storage.
 *
 * A column with id `actions` is pinned to the right edge. Give display columns a `meta.label`
 * (translated) so the column picker can name them.
 */
export interface ServerDataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  pageSizeOptions?: number[];
  searchPlaceholder?: string;
  searchValue?: string;
  className?: string;
  height?: string;
  enableSearch?: boolean;
  enableColumnVisibility?: boolean;
  enablePagination?: boolean;
  enableSorting?: boolean;
  initialSorting?: SortingState;
  initialColumnVisibility?: VisibilityState;
  onSearch?: (search: string) => void;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSortChange?: (sortField: string, sortDirection: "ASC" | "DESC") => void;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  /** Rows carry their own id (`id`); give a key function for rows that do not. */
  getRowId?: (row: TData, index: number) => string;
  isError?: boolean;
  emptyState?: { icon?: React.ReactNode; title?: string; description?: string; action?: React.ReactNode };
  isLoading?: boolean;
  isPending?: boolean;
  onRefresh?: () => void;
  /** Controls after the search box (selects that narrow the result set). */
  filters?: React.ReactNode;
  /** Controls before the search box. */
  leadingFilters?: React.ReactNode;
  /** Buttons at the right end of the toolbar (export, create). */
  toolbarActions?: React.ReactNode;
}

const defaultRowId = (row: unknown, index: number): string => {
  const id = row && typeof row === "object" ? (row as { id?: unknown }).id : undefined;
  return typeof id === "string" || typeof id === "number" ? String(id) : String(index);
};

/** One height for the controls handed to the filter slots, whatever height the caller picked. */
const FILTER_SLOT = "min-h-9 [&_[data-slot=input]]:h-9! [&_[data-slot=select-trigger]]:h-9!";
const ACTIONS_CLASS = "sticky right-0 w-px whitespace-nowrap";

export function ServerDataTable<TData, TValue>({
  columns,
  data,
  totalCount,
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions = [10, 20, 50, 100],
  searchPlaceholder,
  searchValue = "",
  className,
  height,
  enableSearch = true,
  enableColumnVisibility = true,
  enablePagination = true,
  enableSorting = true,
  initialSorting = [],
  initialColumnVisibility,
  onSearch,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onRowClick,
  rowClassName,
  getRowId = defaultRowId,
  isError = false,
  emptyState,
  isLoading = false,
  isPending = false,
  onRefresh,
  filters,
  leadingFilters,
  toolbarActions,
}: ServerDataTableProps<TData, TValue>) {
  const t = useTranslations("dataTable");
  const placeholder = searchPlaceholder || t("search");
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility ?? {});
  const [columnSizing, setColumnSizing] = React.useState<ColumnSizingState>({});
  const [compact, setCompact] = React.useState(false);

  // Sorting is done by the server, but TanStack only sorts a column with an accessor: display
  // columns (id + cell) get a placeholder accessor; `enableSorting: false` still opts out.
  const sortableColumns = React.useMemo(
    () =>
      columns.map((c) =>
        enableSorting && c.enableSorting !== false && !("accessorKey" in c) && !("accessorFn" in c) && c.id && c.id !== "actions"
          ? ({ ...c, accessorFn: () => null } as unknown as ColumnDef<TData, TValue>)
          : c,
      ),
    [columns, enableSorting],
  );

  const table = useReactTable({
    data,
    columns: sortableColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    onColumnSizingChange: setColumnSizing,
    onColumnVisibilityChange: setColumnVisibility,
    state: { columnVisibility, columnSizing, ...(enableSorting ? { sorting: initialSorting } : {}) },
    enableSorting,
    manualSorting: true,
    enableSortingRemoval: false,
    onSortingChange: (updater: Updater<SortingState>) => {
      const next = typeof updater === "function" ? updater(initialSorting) : updater;
      const first = next[0];
      if (onSortChange && first) onSortChange(first.id, first.desc ? "DESC" : "ASC");
    },
  });

  const [localSearch, setLocalSearch] = React.useState(searchValue);
  const debouncedSearch = useDebounce(localSearch, 500);
  React.useEffect(() => {
    if (onSearch && debouncedSearch.trim() !== searchValue) onSearch(debouncedSearch.trim());
  }, [debouncedSearch, onSearch, searchValue]);

  const rows = table.getRowModel().rows;
  const leafCount = table.getVisibleLeafColumns().length || 1;

  return (
    <div className={cn("@container flex w-full max-w-full min-w-0 flex-col overflow-hidden", height ? "" : "h-full", className)} style={height ? { height } : undefined}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-0.5 py-1.5">
        <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-2", FILTER_SLOT)}>
          {leadingFilters}
          {enableSearch && onSearch && (
            <Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon-lg" className={cn(localSearch && "border-primary text-primary")} aria-label={placeholder}>
                      <Search className="size-4" />
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>{placeholder}</TooltipContent>
              </Tooltip>
              <PopoverContent className="w-72 p-2" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder={placeholder} value={localSearch} onChange={(e) => setLocalSearch(e.target.value)} className="h-9 pr-8 pl-8" maxLength={100} autoFocus />
                  {localSearch ? (
                    <button type="button" onClick={() => setLocalSearch("")} aria-label={t("clear")} className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          )}
          {filters}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onRefresh && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon-lg" onClick={onRefresh} aria-label={t("refresh")}>
                  <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("refreshTooltip")}</TooltipContent>
            </Tooltip>
          )}
          {enableColumnVisibility && <DataTableViewOptions table={table} density={compact ? "compact" : "comfortable"} onToggleDensity={() => setCompact((c) => !c)} />}
          {toolbarActions}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div className="flex min-h-0 w-full flex-1 flex-col overflow-auto">
          <table className="w-full caption-bottom bg-card text-sm">
            <TableHeader className="sticky top-0 z-20 bg-muted">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id} className="border-b-0">
                  {hg.headers.map((header) => {
                    const isActions = header.column.id === "actions";
                    return (
                      <TableHead
                        key={header.id}
                        className={cn("relative px-3 text-[11px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase", compact ? "h-7" : "h-9", isActions && cn(ACTIONS_CLASS, "z-30 bg-muted"))}
                        style={!isActions && header.column.getSize() !== 150 ? { width: header.getSize() } : undefined}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {!isActions && header.column.getCanResize() && (
                          <span
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "absolute top-0 right-0 z-20 flex h-full w-2 cursor-col-resize touch-none items-center justify-center select-none",
                              "after:h-1/2 after:w-0.5 after:rounded after:bg-border after:transition-all hover:after:h-full hover:after:bg-primary",
                              header.column.getIsResizing() && "after:h-full after:bg-primary",
                            )}
                          />
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn("group bg-card hover:bg-row-hover", onRowClick && "cursor-pointer", rowClassName?.(row.original))}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === "actions";
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn("px-3 whitespace-nowrap", compact ? "py-1" : "py-2", isActions && cn(ACTIONS_CLASS, "z-10 bg-inherit"))}
                        style={!isActions && cell.column.getSize() !== 150 ? { width: cell.column.getSize(), maxWidth: cell.column.columnDef.maxSize } : undefined}
                        onClick={isActions ? (e) => e.stopPropagation() : undefined}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </table>

          {rows.length === 0 &&
            (isLoading ? (
              <div className="flex flex-1 flex-col overflow-hidden">
                {Array.from({ length: 8 }).map((_, r) => (
                  <div key={r} className="flex min-h-11 flex-1 items-center gap-4 border-b border-border/50 px-4 last:border-b-0">
                    {Array.from({ length: leafCount }).map((__, c) => (
                      <div key={c} className="flex-1">
                        <Skeleton className="h-3 rounded-full" style={{ width: `${[68, 46, 58, 40, 52, 62][c % 6]}%` }} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                <div className={cn("flex size-12 items-center justify-center rounded-full", isError ? "bg-destructive/10" : "bg-muted")}>
                  {isError ? <AlertCircle className="size-6 text-destructive" /> : searchValue ? <SearchX className="size-6 text-muted-foreground" /> : (emptyState?.icon ?? <Inbox className="size-6 text-muted-foreground" />)}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{isError ? t("errorTitle") : searchValue ? t("noMatchTitle", { query: searchValue }) : (emptyState?.title ?? t("emptyTitle"))}</p>
                  <p className="max-w-xs text-xs text-muted-foreground">{isError ? t("errorText") : searchValue ? t("noMatchText") : (emptyState?.description ?? t("emptyText"))}</p>
                </div>
                {!isError && !searchValue && emptyState?.action ? <div className="pt-1">{emptyState.action}</div> : null}
              </div>
            ))}
        </div>
        {(isPending || isLoading) && rows.length > 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
            <Spinner className="size-4" />
          </div>
        )}
        {enablePagination && (
          <div className="shrink-0 border-t bg-muted/40 px-2 py-1.5">
            <ServerDataTablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalCount={totalCount}
              pageSizeOptions={pageSizeOptions}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
