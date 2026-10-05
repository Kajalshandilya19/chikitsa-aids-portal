import type { RowData } from "@tanstack/react-table";

// The column picker (components/ui/data-table-column-toggle.tsx) otherwise labels each entry by
// title-casing the raw column id, which is neither translated nor readable for ids like
// "vendorInvoiceNo". Columns set `meta.label` to a t(...) string so the picker shows the same
// wording as the table header, in the active locale.
declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    label?: string;
  }
}
