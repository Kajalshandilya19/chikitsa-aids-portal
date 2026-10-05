import { Column } from "@tanstack/react-table";
import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconSelector as ChevronsUpDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return (
      <div
        className={cn(
          "text-[11px] font-semibold tracking-wide uppercase",
          className
        )}
      >
        {title}
      </div>
    );
  }

  const sorted = column.getIsSorted();

  return (
    <div className={cn("flex items-center", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-6 gap-1 px-1.5 text-[11px] font-semibold tracking-wide uppercase"
        onClick={() => {
          if (sorted === "asc") {
            column.toggleSorting(true);
          } else {
            column.toggleSorting(false);
          }
        }}
      >
        <span>{title}</span>
        {sorted === "desc" ? (
          <ArrowDown className="size-3" />
        ) : sorted === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ChevronsUpDown className="size-3 opacity-50" />
        )}
      </Button>
    </div>
  );
}
