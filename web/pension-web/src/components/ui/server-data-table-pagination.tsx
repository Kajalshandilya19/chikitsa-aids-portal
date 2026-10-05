"use client";

import { IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight, IconChevronsLeft as ChevronsLeft, IconChevronsRight as ChevronsRight } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ServerDataTablePaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  pageSizeOptions?: (number | string)[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

// Matches the table's own column headers, so the footer reads as part of the same object.
const LABEL = "text-muted-foreground text-[11px] font-semibold tracking-wide uppercase";

export function ServerDataTablePagination({
  currentPage,
  totalPages,
  pageSize,
  totalCount,
  pageSizeOptions = [10, 20, 30, 40, 50, "All"],
  onPageChange,
  onPageSizeChange,
}: ServerDataTablePaginationProps) {
  const t = useTranslations("dataTable");
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  const handlePageSizeChange = (value: string) => {
    if (value === "All") {
      if (onPageSizeChange) {
        onPageSizeChange(totalCount);
      }
    } else {
      const size = parseInt(value, 10);
      if (onPageSizeChange) {
        onPageSizeChange(size);
      }
    }
  };

  const goToPreviousPage = () => {
    if (currentPage > 1 && onPageChange) {
      onPageChange(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages && onPageChange) {
      onPageChange(currentPage + 1);
    }
  };

  const goToFirstPage = () => {
    if (onPageChange) {
      onPageChange(1);
    }
  };

  const goToLastPage = () => {
    if (onPageChange) {
      onPageChange(totalPages);
    }
  };

  return (
    <div className="flex w-full items-center justify-between gap-2 text-xs">
      {/* mobile: hide text; desktop: show */}
      {/* whitespace-nowrap: "Showing 1-4 of 4" was breaking across two lines the moment the
          column narrowed, which is what made the footer look twice as tall as it needed to be. */}
      <div className="text-muted-foreground hidden min-w-0 flex-1 truncate whitespace-nowrap text-[11px] @lg:flex">
        {totalCount > 0 && (
          <>
            {t("showingResults", {
              start: startItem,
              end: endItem,
              total: totalCount,
            })}
          </>
        )}
      </div>

      {/* w-full only while the count label is hidden (below @lg): with the label visible, a
          full-width controls group left zero room for the flex-1 label, which truncated the
          "Showing X–Y of Z" text to nothing in every table. At @lg+ the group hugs the right
          edge and the label keeps the remaining width. */}
      <div className="flex w-full shrink-0 items-center justify-between gap-2 @lg:w-auto @lg:justify-end @3xl:gap-6">
        {/* rows per page */}
        <div className="flex items-center space-x-2">
          <p className={cn("hidden whitespace-nowrap @lg:inline", LABEL)}>
            {t("rowsPerPage")}
          </p>
          <Select
            // Only collapse to "All" when "All" is actually offered, otherwise
            // a coincidental pageSize === totalCount renders an empty Select.
            value={
              pageSizeOptions.some((o) => o === "All") && pageSize === totalCount
                ? "All"
                : pageSize.toString()
            }
            onValueChange={handlePageSizeChange}
          >
            <SelectTrigger size="sm" className="h-7 w-[4.25rem] text-xs">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((size) => (
                <SelectItem
                  key={size}
                  value={typeof size === "number" ? size.toString() : size}
                >
                  {typeof size === "number" ? size : t("all")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* page info: hidden on small screens */}
        <div className={cn("hidden whitespace-nowrap @lg:block", LABEL)}>
          {t("pageOf", { current: currentPage, total: totalPages })}
        </div>

        {/* arrow buttons */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="hidden size-7 @3xl:flex"
            onClick={goToFirstPage}
            disabled={currentPage <= 1}
          >
            <span className="sr-only">{t("goToFirstPage")}</span>
            <ChevronsLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={goToPreviousPage}
            disabled={currentPage <= 1}
          >
            <span className="sr-only">{t("goToPreviousPage")}</span>
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-7"
            onClick={goToNextPage}
            disabled={currentPage >= totalPages}
          >
            <span className="sr-only">{t("goToNextPage")}</span>
            <ChevronRight />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="hidden size-7 @3xl:flex"
            onClick={goToLastPage}
            disabled={currentPage >= totalPages}
          >
            <span className="sr-only">{t("goToLastPage")}</span>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
