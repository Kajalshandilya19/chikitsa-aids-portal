"use client";

import { Table } from "@tanstack/react-table";
import { IconAdjustmentsHorizontal as Settings2 } from "@tabler/icons-react";
import { useTranslations } from "next-intl";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

export function DataTableViewOptions<TData>({
  table,
  density,
  onToggleDensity,
}: {
  table: Table<TData>;
  density?: "comfortable" | "compact";
  onToggleDensity?: () => void;
}) {
  const t = useTranslations("dataTable");
  const formatColumnName = (id: string) => {
    // Convert camelCase to space separated
    const withSpaces = id.replace(/([a-z])([A-Z])/g, "$1 $2");
    // Convert snake_case to space
    const noUnderscores = withSpaces.replace(/_/g, " ");
    // Title case
    return noUnderscores.replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon-lg" aria-label={t("view")}>
          <Settings2 className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-fit">
        {onToggleDensity && (
          <>
            <DropdownMenuLabel>{t("display")}</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={density === "compact"}
              onCheckedChange={onToggleDensity}
              onSelect={(e) => e.preventDefault()}
            >
              {t("compactRows")}
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel>{t("toggleColumns")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          // Display columns (id + cell, no accessor) count too once they declare a label: the
          // report and referral tables are built that way and their menus were coming up empty.
          .filter(
            (column) =>
              (typeof column.accessorFn !== "undefined" || !!column.columnDef.meta?.label) && column.getCanHide(),
          )
          .map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              className="capitalize"
              checked={column.getIsVisible()}
              onCheckedChange={(value) => column.toggleVisibility(!!value)}
              onSelect={(e) => e.preventDefault()}
            >
              {/* Translated label when the column declares one; otherwise fall back to the
                  title-cased id, which is what every pre-existing table relies on. */}
              {column.columnDef.meta?.label ?? formatColumnName(column.id)}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
