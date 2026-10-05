"use client";

import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Power, Upload } from "lucide-react";
import { z } from "zod";

import { FilterCombobox, ANY_VALUE } from "@/components/inputs/filter-combobox";
import { ActiveBadge } from "@/components/common/active-badge";
import { PageHeader } from "@/components/dashboard/page-header";
import { BulkUploadSheet, type BulkUploadColumn, type ServerRowError } from "@/components/ui/bulk-upload-sheet";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ServerDataTable } from "@/components/ui/server-data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToneBadge } from "@/components/ui/tone-badge";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import { useConfirm } from "@/hooks/use-confirm";
import { useDistricts } from "@/hooks/use-masters";
import { useServerTable } from "@/hooks/use-server-table";
import type { Center, ImportBatch, ImportRow } from "@/lib/api-types";
import { ApiError, api, fieldErrors, gw, saveBlob } from "@/lib/client/api";
import { blankOr } from "@/lib/forms";
import { CENTER_TYPE_VALUES, centerCode, centerType, englishLabel, hindiText, lgdCode, sochBeneficiaryId, uuid } from "@/lib/shared/validators";
import { P } from "@/lib/shared/permission-codes";
import { useSession } from "@/providers/session-provider";

const centerFormSchema = z.object({
  code: centerCode,
  name_en: englishLabel,
  name_hi: blankOr(hindiText),
  district_id: uuid,
  center_type: centerType,
  soch_facility_code: blankOr(sochBeneficiaryId),
});

type CenterFormValues = z.input<typeof centerFormSchema>;
type CenterType = z.infer<typeof centerType>;
type CenterCreateBody = {
  code: string;
  name_en: string;
  name_hi: string | null;
  district_id: string;
  center_type: CenterType;
  soch_facility_code: string | null;
};
type CenterPatchBody = Omit<CenterCreateBody, "code">;
type CenterWriteCommand =
  | { mode: "create"; body: CenterCreateBody }
  | { mode: "edit"; id: string; body: CenterPatchBody };
type CenterFormField = keyof CenterFormValues;

const EMPTY_FORM: CenterFormValues = {
  code: "",
  name_en: "",
  name_hi: "",
  district_id: "",
  center_type: "ART",
  soch_facility_code: "",
};

const FIELD_MAP: Partial<Record<string, CenterFormField>> = {
  code: "code",
  name_en: "name_en",
  name_hi: "name_hi",
  district_id: "district_id",
  center_type: "center_type",
  soch_facility_code: "soch_facility_code",
};

const PAGE_SIZE = 100;

async function loadImportRows(batchId: string, status: "ERROR" | "DUPLICATE"): Promise<ImportRow[]> {
  const url = gw("data", `imports/${batchId}/rows`);
  const firstPage = await api.getPage<ImportRow[]>(url, { status, page: 1, limit: PAGE_SIZE });
  const rows = [...firstPage.data];
  const pageCount = Math.ceil((firstPage.meta?.total ?? rows.length) / PAGE_SIZE);

  for (let first = 2; first <= pageCount; first += 10) {
    const pageNumbers = Array.from(
      { length: Math.min(10, pageCount - first + 1) },
      (_, index) => first + index,
    );
    const nextPages = await Promise.all(
      pageNumbers.map((page) => api.getPage<ImportRow[]>(url, { status, page, limit: PAGE_SIZE })),
    );
    rows.push(...nextPages.flatMap((page) => page.data));
  }

  return rows;
}

export default function CentersPage() {
  const t = useTranslations("centers");
  const importText = useTranslations("centerImport");
  const common = useTranslations("common");
  const queryClient = useQueryClient();
  const { can } = useSession();
  const errorText = useApiErrorText();
  const districts = useDistricts();
  const [confirmDialog, confirm] = useConfirm();

  const [districtFilter, setDistrictFilter] = useState(ANY_VALUE);
  const [statusFilter, setStatusFilter] = useState(ANY_VALUE);
  const [dialogMode, setDialogMode] = useState<"create" | "edit" | null>(null);
  const [editingCenter, setEditingCenter] = useState<Center | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBatch, setImportBatch] = useState<ImportBatch | null>(null);
  const [importErrors, setImportErrors] = useState<ServerRowError[]>([]);
  const [importRowsError, setImportRowsError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingImportErrors, setIsLoadingImportErrors] = useState(false);
  const [isConfirmingImport, setIsConfirmingImport] = useState(false);

  const form = useForm<CenterFormValues>({
    resolver: zodResolver(centerFormSchema),
    defaultValues: EMPTY_FORM,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const filters = useMemo(
    () => ({
      ...(can(P.MASTER_DISTRICT_VIEW) && districtFilter !== ANY_VALUE
        ? { district_id: districtFilter }
        : {}),
      ...(statusFilter !== ANY_VALUE ? { is_active: statusFilter } : {}),
    }),
    [can, districtFilter, statusFilter],
  );
  const table = useServerTable<Center>(
    gw("auth", "centers"),
    filters,
    {
      search: true,
      sortMap: { code: "code", name_en: "name_en", district: "district" },
      defaultSort: { id: "code", desc: false },
    },
  );

  const districtOptions = useMemo(
    () =>
      (districts.data ?? []).map((district) => ({
        value: district.id,
        label: district.name_en,
        hint: district.code,
      })),
    [districts.data],
  );

  const invalidateCenters = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [gw("auth", "centers")] }),
      queryClient.invalidateQueries({ queryKey: ["center-search"] }),
    ]);
  };

  const saveCenter = useMutation({
    mutationFn: async (command: CenterWriteCommand) => {
      if (command.mode === "create") {
        return api.post<Center>(gw("auth", "centers"), command.body);
      }
      return api.patch<Center>(gw("auth", `centers/${command.id}`), command.body);
    },
    onSuccess: async (_center, command) => {
      await invalidateCenters();
      setDialogMode(null);
      setEditingCenter(null);
      toast.success(t(command.mode === "create" ? "created" : "saved"));
    },
    onError: (error: unknown) => {
      for (const [field, message] of Object.entries(fieldErrors(error))) {
        const formField = FIELD_MAP[field];
        if (formField) form.setError(formField, { message });
      }
      toast.error(errorText(error));
    },
  });

  const changeCenterStatus = useMutation({
    mutationFn: ({ center, activate }: { center: Center; activate: boolean }) =>
      api.post<Center>(gw("auth", `centers/${center.id}/${activate ? "activate" : "deactivate"}`), {}),
    onSuccess: async (_center, { activate }) => {
      await invalidateCenters();
      toast.success(t(activate ? "activated" : "deactivated"));
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  });

  const openCreate = useCallback(() => {
    setEditingCenter(null);
    form.reset(EMPTY_FORM);
    setDialogMode("create");
  }, [form]);

  const openEdit = useCallback((center: Center) => {
    setEditingCenter(center);
    form.reset({
      code: center.code,
      name_en: center.name_en,
      name_hi: center.name_hi ?? "",
      district_id: center.district?.id ?? "",
      center_type: center.center_type,
      soch_facility_code: center.soch_facility_code ?? "",
    });
    setDialogMode("edit");
  }, [form]);

  const requestStatusChange = useCallback((center: Center) => {
    const activate = !center.is_active;
    confirm(
      {
        title: t(activate ? "activateTitle" : "deactivateTitle", { code: center.code }),
        description: t(activate ? "activateText" : "deactivateText"),
        variant: activate ? "success" : "warning",
        confirmText: t(activate ? "activate" : "deactivate"),
      },
      async () => {
        await changeCenterStatus.mutateAsync({ center, activate });
      },
    );
  }, [changeCenterStatus, confirm, t]);

  const columns = useMemo<ColumnDef<Center>[]>(() => {
    const result: ColumnDef<Center>[] = [
      {
        accessorKey: "code",
        header: t("code"),
      },
      {
        accessorKey: "name_en",
        header: t("name"),
        cell: ({ row }) => (
          <div className="min-w-40 whitespace-normal">
            <p className="font-medium">{row.original.name_en}</p>
            <p className="text-xs text-muted-foreground">{row.original.name_hi || t("noHindiName")}</p>
          </div>
        ),
      },
      {
        id: "district",
        accessorFn: (center) => center.district?.name_en ?? "",
        header: t("district"),
        cell: ({ row }) => row.original.district?.name_en ?? t("noDistrict"),
      },
      {
        accessorKey: "center_type",
        header: t("type"),
        enableSorting: false,
        cell: ({ row }) => t(`types.${row.original.center_type}`),
      },
      {
        accessorKey: "soch_facility_code",
        header: t("sochCode"),
        cell: ({ row }) => row.original.soch_facility_code || t("notProvided"),
        enableSorting: false,
      },
      {
        id: "status",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <ActiveBadge active={row.original.is_active} />
            {row.original.is_placeholder && (
              <ToneBadge tone="neutral" title={t("placeholderHint")}>
                {t("placeholder")}
              </ToneBadge>
            )}
          </div>
        ),
      },
    ];

    if (can(P.MASTER_CENTER_EDIT)) {
      result.push({
        id: "actions",
        header: common("actions"),
        enableSorting: false,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("actionsFor", { code: row.original.code })}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => openEdit(row.original)}>
                <Pencil aria-hidden />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => requestStatusChange(row.original)}>
                <Power aria-hidden />
                {t(row.original.is_active ? "deactivate" : "activate")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      });
    }

    return result;
  }, [can, common, openEdit, requestStatusChange, t]);

  const uploadColumns = useMemo<BulkUploadColumn[]>(() => [
    {
      key: "code",
      label: "Center Code",
      required: true,
      validate: (value) => {
        const parsed = centerCode.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
    {
      key: "name_en",
      label: "Center Name",
      required: true,
      validate: (value) => {
        const parsed = englishLabel.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
    {
      key: "name_hi",
      label: "Center Name (Hindi)",
      validate: (value) => {
        const parsed = hindiText.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
    {
      key: "district_lgd_code",
      label: "District LGD Code",
      required: true,
      validate: (value) => {
        const parsed = lgdCode.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
    {
      key: "center_type",
      label: "Center Type",
      required: true,
      type: "dropdown",
      options: CENTER_TYPE_VALUES,
      validate: (value) => {
        const parsed = centerType.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
    {
      key: "soch_facility_code",
      label: "SOCH Facility Code",
      validate: (value) => {
        const parsed = sochBeneficiaryId.safeParse(value);
        return parsed.success ? null : parsed.error.issues[0]?.message ?? null;
      },
    },
  ], []);

  function closeForm(open: boolean) {
    if (!open && !saveCenter.isPending) {
      setDialogMode(null);
      setEditingCenter(null);
      form.reset(EMPTY_FORM);
    }
  }

  function submitForm(values: CenterFormValues) {
    const shared = {
      name_en: values.name_en,
      name_hi: values.name_hi || null,
      district_id: values.district_id,
      center_type: values.center_type,
      soch_facility_code: values.soch_facility_code || null,
    };
    if (dialogMode === "create") {
      void saveCenter.mutateAsync({ mode: "create", body: { code: values.code, ...shared } });
    } else if (dialogMode === "edit" && editingCenter) {
      void saveCenter.mutateAsync({
        mode: "edit",
        id: editingCenter.id,
        body: shared,
      });
    }
  }

  async function handleTemplateDownload() {
    try {
      const result = await api.download(gw("data", "imports/templates/centers"));
      saveBlob(result.blob, result.fileName ?? "center-import-template.xlsx");
    } catch (error) {
      toast.error(errorText(error));
    }
  }

  async function fetchImportErrors(batchId: string) {
    setIsLoadingImportErrors(true);
    setImportRowsError("");
    try {
      const [errors, duplicates] = await Promise.all([
        loadImportRows(batchId, "ERROR"),
        loadImportRows(batchId, "DUPLICATE"),
      ]);
      const mapped: ServerRowError[] = [
        ...errors.flatMap((row) =>
          row.errors.map((error) => ({
            rowNumber: row.row_number,
            field: error.field,
            message: error.message,
          })),
        ),
        ...duplicates.flatMap((row) =>
          row.errors.length > 0
            ? row.errors.map((error) => ({
                rowNumber: row.row_number,
                field: error.field,
                message: error.message,
              }))
            : [{
                rowNumber: row.row_number,
                field: "code",
                message: importText("duplicateRow"),
              }],
        ),
      ];
      setImportErrors(mapped);
    } catch (error) {
      setImportRowsError(errorText(error));
      toast.error(errorText(error));
    } finally {
      setIsLoadingImportErrors(false);
    }
  }

  async function handleUpload(file: File) {
    setIsUploading(true);
    setImportBatch(null);
    setImportErrors([]);
    setImportRowsError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const batch = await api.post<ImportBatch>(gw("data", "imports/centers"), body);
      setImportBatch(batch);
      await fetchImportErrors(batch.id);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleConfirmImport() {
    if (!importBatch) return;
    setIsConfirmingImport(true);
    try {
      const committed = await api.post<ImportBatch>(
        gw("data", `imports/${importBatch.id}/commit`),
        {},
      );
      setImportBatch(committed);
      await Promise.all([
        invalidateCenters(),
        queryClient.invalidateQueries({ queryKey: ["imports"] }),
      ]);
      toast.success(importText("committed", {
        created: committed.create_count,
        updated: committed.update_count,
      }));
    } finally {
      setIsConfirmingImport(false);
    }
  }

  async function handleCancelImport() {
    if (!importBatch) return;
    if (importBatch.status === "VALIDATED") {
      await api.post<ImportBatch>(gw("data", `imports/${importBatch.id}/cancel`), {});
      await queryClient.invalidateQueries({ queryKey: ["imports"] });
      toast.success(importText("statuses.CANCELLED"));
    }
    setImportBatch(null);
    setImportErrors([]);
    setImportRowsError("");
  }

  const activeImportErrorCount = importBatch?.error_count ?? 0;
  const headerWarningCount = importBatch?.header_errors.length ?? 0;
  const showDistrictFilter = can(P.MASTER_DISTRICT_VIEW);
  const canCommitImport = can(P.IMPORT_CENTER_COMMIT);

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={
            <>
              {can(P.IMPORT_CENTER_UPLOAD) && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setImportBatch(null);
                    setImportErrors([]);
                    setImportRowsError("");
                    setImportOpen(true);
                  }}
                >
                  <Upload aria-hidden />
                  {t("bulkImport")}
                </Button>
              )}
              {can(P.MASTER_CENTER_CREATE) && (
                <Button type="button" onClick={openCreate}>
                  <Plus aria-hidden />
                  {t("create")}
                </Button>
              )}
            </>
          }
        />

        <div className="flex flex-wrap gap-2">
          {showDistrictFilter && (
            <FilterCombobox
              value={districtFilter}
              onChange={setDistrictFilter}
              options={districtOptions}
              placeholder={t("filterDistrict")}
              allLabel={t("allDistricts")}
              loading={districts.isLoading}
              emptyLabel={common("noMatch")}
              className="w-full sm:w-56"
            />
          )}
          <FilterCombobox
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "true", label: common("active") },
              { value: "false", label: common("inactive") },
            ]}
            placeholder={t("filterStatus")}
            allLabel={t("allStatuses")}
            className="w-full sm:w-48"
          />
        </div>

        {(table.query.isError || districts.isError) && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                {errorText(table.query.isError ? table.query.error : districts.error)}
              </p>
              {table.query.error instanceof ApiError && table.query.error.requestId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("requestId", { id: table.query.error.requestId })}
                </p>
              )}
              {!table.query.isError && districts.error instanceof ApiError && districts.error.requestId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("requestId", { id: districts.error.requestId })}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (table.query.isError) void table.query.refetch();
                if (districts.isError) void districts.refetch();
              }}
            >
              {common("retry")}
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <ServerDataTable
            columns={columns}
            {...table.tableProps}
            searchPlaceholder={t("searchPlaceholder")}
            emptyState={{
              title: t("emptyTitle"),
              description: t("emptyText"),
            }}
            getRowId={(center) => center.id}
          />
        </div>
      </div>

      <Dialog open={dialogMode !== null} onOpenChange={closeForm}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit"
                ? t("editTitle", { code: editingCenter?.code ?? "" })
                : t("createTitle")}
            </DialogTitle>
            <DialogDescription>{t("formDescription")}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(submitForm)} className="space-y-4">
              {dialogMode === "create" ? (
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("code")}</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-2">
                  <FormLabel>{t("code")}</FormLabel>
                  <Input value={editingCenter?.code ?? ""} readOnly />
                  <p className="text-sm text-muted-foreground">{t("codeFixed")}</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="name_en"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("name")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name_hi"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("nameHi")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="district_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("district")}</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={districts.isLoading || districts.isError || !districtOptions.length}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder={t("selectDistrict")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {districtOptions.map((district) => (
                          <SelectItem key={district.value} value={district.value}>
                            {district.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {districts.isError && (
                      <FormDescription>{t("districtLoadFailed")}</FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="center_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("type")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CENTER_TYPE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {t(`types.${value}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="soch_facility_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sochCode")}</FormLabel>
                    <FormControl>
                      <Input autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => closeForm(false)} disabled={saveCenter.isPending}>
                  {common("cancel")}
                </Button>
                <Button type="submit" disabled={saveCenter.isPending || districts.isLoading || districts.isError || !districtOptions.length}>
                  {saveCenter.isPending ? common("loading") : common("save")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {confirmDialog}

      <BulkUploadSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        title={importText("title")}
        description={importText("description")}
        columns={uploadColumns}
        fileName="centers.csv"
        isUploading={isUploading}
        onUpload={handleUpload}
        onDownloadTemplate={() => void handleTemplateDownload()}
        serverErrors={importErrors}
        summary={importBatch ? (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3 text-sm">
            <p className="font-semibold">{importText(`statuses.${importBatch.status}`)}</p>
            {importBatch.status === "REJECTED" && (
              <p role="alert" className="text-destructive">{importText("rejected")}</p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <span>{importText("rows")}: {importBatch.row_count}</span>
              <span>{importText("create")}: {importBatch.create_count}</span>
              <span>{importText("update")}: {importBatch.update_count}</span>
              <span>{importText("unchanged")}: {importBatch.unchanged_count}</span>
              <span>{importText("errors")}: {activeImportErrorCount}</span>
              <span>{importText("duplicates")}: {importBatch.duplicate_count}</span>
            </div>
            {headerWarningCount > 0 && (
              <p>{importText("headerWarnings", { count: headerWarningCount })}</p>
            )}
            {isLoadingImportErrors && <p role="status">{common("loading")}</p>}
            {importRowsError && (
              <div className="flex flex-wrap items-center gap-2 text-destructive">
                <span>{importText("rowErrorsLoadFailed")}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void fetchImportErrors(importBatch.id)}>
                  {common("retry")}
                </Button>
              </div>
            )}
          </div>
        ) : undefined}
        confirmLabel={importText("confirm")}
        onConfirm={canCommitImport ? handleConfirmImport : undefined}
        canConfirm={!!importBatch && importBatch.status === "VALIDATED" && importBatch.valid_count > 0}
        isConfirming={isConfirmingImport}
        onCancelImport={handleCancelImport}
      />
    </>
  );
}
