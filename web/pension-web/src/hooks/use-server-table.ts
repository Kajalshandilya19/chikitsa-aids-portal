"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, type Meta, type QueryParams } from "@/lib/client/api";
import { searchText } from "@/lib/shared/validators";

export interface TableSort {
  /** Column id (mapped to the API sort key through `sortMap`). */
  id: string;
  desc: boolean;
}

export interface ServerTableOptions {
  pageSize?: number;
  enabled?: boolean;
  /**
   * Column id -> API `sort` value. Only when given are `sort` and `dir` sent: the services' list
   * queries are `.strict()` and refuse parameters they do not know.
   */
  sortMap?: Record<string, string>;
  defaultSort?: TableSort;
  /** Send the search box as `q` (V-030). Off for endpoints without `q`. */
  search?: boolean;
}

/**
 * State + query for a ServerDataTable backed by a paged endpoint (`?page&limit[&q][&sort&dir]`).
 * `url` is a BFF URL, normally `gw("auth", "centers")`. Filters are passed in; changing them resets
 * to page 1. Results live in the react-query memory cache only.
 */
export function useServerTable<T>(url: string, filters: QueryParams, opts: ServerTableOptions = {}) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(opts.pageSize ?? 20);
  const [q, setQ] = useState("");
  const [sort, setSortState] = useState<TableSort | null>(opts.defaultSort ?? null);
  const sortField = sort && opts.sortMap ? opts.sortMap[sort.id] : undefined;

  // Changing a filter goes back to page 1 (state adjusted during render, React's documented pattern).
  const key = JSON.stringify(filters);
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setPage(1);
  }

  const params: QueryParams = {
    ...filters,
    page,
    limit,
    ...(opts.search && q ? { q } : {}),
    ...(sortField ? { sort: sortField, dir: sort?.desc ? "desc" : "asc" } : {}),
  };
  const query = useQuery({
    queryKey: [url, params],
    queryFn: () => api.getPage<T[]>(url, params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
  const meta: Meta = query.data?.meta ?? { page, limit, total: 0 };
  const totalPages = Math.max(1, Math.ceil(meta.total / limit));
  const rows = query.data?.data ?? [];

  return {
    rows,
    total: meta.total,
    page,
    query,
    tableProps: {
      data: rows,
      totalCount: meta.total,
      currentPage: page,
      totalPages,
      pageSize: limit,
      pageSizeOptions: [10, 20, 50, 100],
      searchValue: q,
      enableSearch: !!opts.search,
      isLoading: query.isLoading,
      isPending: query.isFetching,
      isError: query.isError,
      onRefresh: () => void query.refetch(),
      onSearch: (s: string) => {
        // Only text the service accepts (V-030); anything else is ignored rather than sent.
        if (s && !searchText.safeParse(s).success) return;
        setQ(s);
        setPage(1);
      },
      onPageChange: setPage,
      onPageSizeChange: (s: number) => {
        setLimit(s);
        setPage(1);
      },
      enableSorting: !!opts.sortMap,
      initialSorting: sort ? [sort] : [],
      onSortChange: (field: string, dir: "ASC" | "DESC") => {
        if (!opts.sortMap?.[field]) return;
        setSortState({ id: field, desc: dir === "DESC" });
        setPage(1);
      },
    },
  };
}
