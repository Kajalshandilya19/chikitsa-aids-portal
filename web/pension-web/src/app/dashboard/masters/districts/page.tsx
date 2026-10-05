"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { ActiveBadge } from "@/components/common/active-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { ServerDataTable } from "@/components/ui/server-data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import type { District } from "@/lib/api-types";
import { ApiError, api, gw } from "@/lib/client/api";
import { P } from "@/lib/shared/permission-codes";
import { hindiText, searchText } from "@/lib/shared/validators";
import { useDistricts } from "@/hooks/use-masters";
import { useSession } from "@/providers/session-provider";
import { useValidationText } from "@/hooks/use-validation-text";

const EMPTY_DISTRICTS: District[] = [];

export default function DistrictsPage() {
  const t = useTranslations("districts");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const { can } = useSession();
  const errorText = useApiErrorText();
  const validationText = useValidationText();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
  const [editNameHi, setEditNameHi] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [validationError, setValidationError] = useState("");

  const districts = useDistricts();

  const districtRows = districts.data ?? EMPTY_DISTRICTS;

  const updateDistrict = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name_hi?: string; is_active?: boolean } }) =>
      api.patch<District>(gw("auth", `districts/${id}`), patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["districts"] });
      setEditingDistrict(null);
      toast.success(t("saved"));
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  });

  const filteredDistricts = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return districtRows;

    return districtRows.filter((district) =>
      [
        district.lgd_code,
        district.code,
        district.name_en,
        district.name_hi,
      ]
        .filter((value) => value !== null && value !== undefined)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [districtRows, search]);

  const openEdit = (district: District) => {
    setEditingDistrict(district);
    setEditNameHi(district.name_hi ?? "");
    setEditActive(district.is_active);
    setValidationError("");
  };

  const saveEdit = () => {
    if (!editingDistrict) return;

    const patch: { name_hi?: string; is_active?: boolean } = {};
    if (editNameHi.trim() !== (editingDistrict.name_hi ?? "")) {
      const parsedName = hindiText.safeParse(editNameHi);
      if (!parsedName.success) {
        setValidationError(validationText(parsedName.error.issues[0]?.message));
        return;
      }
      patch.name_hi = parsedName.data;
    }
    if (editActive !== editingDistrict.is_active) patch.is_active = editActive;

    if (Object.keys(patch).length > 0) {
      updateDistrict.mutate({ id: editingDistrict.id, patch });
    } else {
      setEditingDistrict(null);
    }
  };

  const columns = useMemo<ColumnDef<District>[]>(() => {
    const columnDefs: ColumnDef<District>[] = [
      {
        accessorKey: "lgd_code",
        header: t("lgdCode"),
      },
      {
        accessorKey: "code",
        header: t("code"),
      },
      {
        accessorKey: "name_en",
        header: t("nameEn"),
      },
      {
        accessorKey: "name_hi",
        header: t("nameHi"),
        cell: ({ row }) => row.original.name_hi || t("noHindiName"),
      },
      {
        id: "status",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => (
          <ActiveBadge active={row.original.is_active} />
        ),
      },
    ];

    if (can(P.MASTER_DISTRICT_EDIT)) {
      columnDefs.push({
        id: "actions",
        header: t("edit"),
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openEdit(row.original)}
          >
            {t("edit")}
          </Button>
        ),
      });
    }

    return columnDefs;
  }, [can, t]);

  const handleSearch = (value: string) => {
    setSearchInput(value);
    if (!value) {
      setSearch("");
      setSearchError("");
      return;
    }
    const parsed = searchText.safeParse(value);
    if (!parsed.success) {
      setSearchError(validationText(parsed.error.issues[0]?.message));
      return;
    }
    setSearch(parsed.data);
    setSearchError("");
  };

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("description")}
        />

        <div className="max-w-sm">
          <Input
            value={searchInput}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-invalid={!!searchError}
            aria-describedby={searchError ? "district-search-error" : undefined}
          />
          {searchError && (
            <p id="district-search-error" className="mt-1 text-xs text-destructive">
              {searchError}
            </p>
          )}
        </div>

        {districts.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{errorText(districts.error)}</p>
              {districts.error instanceof ApiError && districts.error.requestId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Request ID: {districts.error.requestId}
                </p>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void districts.refetch()}>
              {common("retry")}
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <ServerDataTable
            columns={columns}
            data={filteredDistricts}
            totalCount={filteredDistricts.length}
            currentPage={1}
            totalPages={1}
            pageSize={filteredDistricts.length || 1}
            pageSizeOptions={[41]}
            searchValue={search}
            enableSearch={false}
            enablePagination={false}
            enableSorting={false}
            enableColumnVisibility={false}
            isLoading={districts.isLoading}
            isPending={districts.isFetching}
            isError={districts.isError}
            emptyState={{
              title: districts.isError
                ? t("loadFailed")
                : search
                  ? t("noMatchTitle")
                  : t("emptyTitle"),
              description: districts.isError
                ? t("emptyErrorText")
                : search
                  ? t("noMatchText")
                  : t("emptyText"),
            }}
            onRefresh={() => void districts.refetch()}
            getRowId={(row) => row.id}
          />
        </div>
      </div>

      <Dialog
        open={editingDistrict !== null}
        onOpenChange={(open) => {
          if (!open && !updateDistrict.isPending) setEditingDistrict(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editTitle", { name: editingDistrict?.name_en ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("editDescription")}
            </DialogDescription>
          </DialogHeader>

          {editingDistrict && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="district-name-en" className="text-sm font-medium">
                  {t("nameEn")}
                </label>
                <Input id="district-name-en" value={editingDistrict.name_en} readOnly />
              </div>

              <div className="space-y-2">
                <label htmlFor="district-name-hi" className="text-sm font-medium">
                  {t("nameHi")}
                </label>
                <Input
                  id="district-name-hi"
                  value={editNameHi}
                  onChange={(event) => setEditNameHi(event.target.value)}
                  placeholder={t("nameHi")}
                  disabled={updateDistrict.isPending}
                  aria-invalid={!!validationError}
                  aria-describedby={validationError ? "district-name-hi-error" : undefined}
                />
                {validationError && (
                  <p id="district-name-hi-error" className="text-xs text-destructive">
                    {validationError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                <label htmlFor="district-active" className="text-sm font-medium">
                  {t("status")}
                </label>
                <Switch
                  id="district-active"
                  checked={editActive}
                  onCheckedChange={setEditActive}
                  disabled={updateDistrict.isPending}
                  aria-label={t("status")}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingDistrict(null)}
              disabled={updateDistrict.isPending}
            >
              {common("cancel")}
            </Button>
            <Button type="button" onClick={saveEdit} disabled={updateDistrict.isPending}>
              {updateDistrict.isPending ? common("loading") : common("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
