"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Power, Upload } from "lucide-react";
import { z } from "zod";

import { PreviewSidebar } from "@/components/preview/preview-sidebar";
import { FilterCombobox, ANY_VALUE } from "@/components/inputs/filter-combobox";
import { BulkUploadSheet, type BulkUploadColumn, type ServerRowError } from "@/components/ui/bulk-upload-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActiveBadge } from "@/components/common/active-badge";
import { ToneBadge } from "@/components/ui/tone-badge";
import { useConfirm } from "@/hooks/use-confirm";
import { usePreviewCenters } from "@/hooks/use-preview-centers";
import { useValidationText } from "@/hooks/use-validation-text";
import type { Center } from "@/lib/api-types";
import { saveBlob } from "@/lib/client/api";
import { blankOr } from "@/lib/forms";
import { CENTER_TYPE_VALUES, centerCode, centerType, englishLabel, hindiText, lgdCode, searchText, sochBeneficiaryId, uuid } from "@/lib/shared/validators";
import {
  PREVIEW_DISTRICTS,
  savePreviewCenter,
  setPreviewCenterActive,
  upsertPreviewCenters,
  type PreviewCenterInput,
} from "@/lib/preview/centers";
import { parseCSVFile, parseXLSX } from "@/components/ui/spreadsheet/utils/import-export";

const centerFormSchema = z.object({
  code: centerCode,
  name_en: englishLabel,
  name_hi: blankOr(hindiText),
  district_id: uuid,
  center_type: centerType,
  soch_facility_code: blankOr(sochBeneficiaryId),
});

type CenterFormValues = z.input<typeof centerFormSchema>;

const EMPTY_FORM: CenterFormValues = {
  code: "",
  name_en: "",
  name_hi: "",
  district_id: "",
  center_type: "ART",
  soch_facility_code: "",
};

const districtById = (id: string) => PREVIEW_DISTRICTS.find((district) => district.id === id);

function importRowErrors(values: string[], rowNumber: number, priorCodes: Set<string>, existingCenters: Center[]) {
  const errors: ServerRowError[] = [];
  const [rawCode = "", rawName = "", rawNameHi = "", rawDistrictCode = "", rawType = "", rawSoch = ""] = values;
  const code = centerCode.safeParse(rawCode);
  const name = englishLabel.safeParse(rawName);
  const nameHi = rawNameHi ? hindiText.safeParse(rawNameHi) : null;
  const districtCode = lgdCode.safeParse(rawDistrictCode);
  const type = centerType.safeParse(rawType);
  const soch = rawSoch ? sochBeneficiaryId.safeParse(rawSoch) : null;

  if (!code.success) errors.push({ rowNumber, field: "code", message: code.error.issues[0]?.message ?? "Invalid Center Code" });
  if (!name.success) errors.push({ rowNumber, field: "name_en", message: name.error.issues[0]?.message ?? "Invalid Center Name" });
  if (nameHi && !nameHi.success) errors.push({ rowNumber, field: "name_hi", message: nameHi.error.issues[0]?.message ?? "Invalid Hindi Name" });
  if (!districtCode.success) errors.push({ rowNumber, field: "district_lgd_code", message: districtCode.error.issues[0]?.message ?? "Invalid District LGD Code" });
  if (!type.success) errors.push({ rowNumber, field: "center_type", message: type.error.issues[0]?.message ?? "Invalid Center Type" });
  if (soch && !soch.success) errors.push({ rowNumber, field: "soch_facility_code", message: soch.error.issues[0]?.message ?? "Invalid SOCH Facility Code" });
  if (code.success && priorCodes.has(code.data)) {
    errors.push({ rowNumber, field: "code", message: "duplicate" });
  }
  if (districtCode.success && !PREVIEW_DISTRICTS.some((district) => district.lgd_code === districtCode.data)) {
    errors.push({ rowNumber, field: "district_lgd_code", message: "district" });
  }

  const normalizedCode = code.success ? code.data : "";
  if (normalizedCode) priorCodes.add(normalizedCode);
  if (
    errors.length > 0 ||
    !code.success ||
    !name.success ||
    !districtCode.success ||
    !type.success ||
    !districtById(PREVIEW_DISTRICTS.find((district) => district.lgd_code === districtCode.data)?.id ?? "")
  ) {
    return { errors, input: null, isUpdate: false, isUnchanged: false };
  }

  const district = PREVIEW_DISTRICTS.find((item) => item.lgd_code === districtCode.data)!;
  const input: PreviewCenterInput = {
    code: code.data,
    name_en: name.data,
    name_hi: nameHi?.success ? nameHi.data : null,
    district_id: district.id,
    center_type: type.data,
    soch_facility_code: soch?.success ? soch.data : null,
  };
  const existing = existingCenters.find((center) => center.code === input.code);
  const isUnchanged = !!existing &&
    existing.name_en === input.name_en &&
    existing.name_hi === input.name_hi &&
    existing.district?.id === input.district_id &&
    existing.center_type === input.center_type &&
    existing.soch_facility_code === input.soch_facility_code;
  return { errors, input, isUpdate: !!existing, isUnchanged };
}

export default function PreviewCentersPage() {
  const t = useTranslations("centers");
  const previewText = useTranslations("preview");
  const importText = useTranslations("previewCenterImport");
  const common = useTranslations("common");
  const tableText = useTranslations("dataTable");
  const validationText = useValidationText();
  const centers = usePreviewCenters();
  const [confirmDialog, confirm] = useConfirm();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [districtFilter, setDistrictFilter] = useState(ANY_VALUE);
  const [statusFilter, setStatusFilter] = useState(ANY_VALUE);
  const [sortKey, setSortKey] = useState<"code" | "name_en" | "district">("code");
  const [sortDescending, setSortDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [editingCenter, setEditingCenter] = useState<Center | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importErrors, setImportErrors] = useState<ServerRowError[]>([]);
  const [stagedImport, setStagedImport] = useState<{
    inputs: PreviewCenterInput[];
    valid: number;
    created: number;
    updated: number;
    unchanged: number;
    errors: number;
  } | null>(null);

  const form = useForm<CenterFormValues>({
    resolver: zodResolver(centerFormSchema),
    defaultValues: EMPTY_FORM,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const pageSize = 5;
  const filteredCenters = useMemo(() => {
    const needle = search.toLowerCase().trim();
    return centers.filter((center) => {
      const districtName = center.district?.name_en ?? "";
      const matchesText = !needle || `${center.code} ${center.name_en} ${center.name_hi ?? ""} ${districtName} ${center.center_type} ${center.soch_facility_code ?? ""}`.toLowerCase().includes(needle);
      const matchesDistrict = districtFilter === ANY_VALUE || center.district?.id === districtFilter;
      const matchesStatus = statusFilter === ANY_VALUE || String(center.is_active) === statusFilter;
      return matchesText && matchesDistrict && matchesStatus;
    }).sort((a, b) => {
      const value = sortKey === "district"
        ? (a.district?.name_en ?? "").localeCompare(b.district?.name_en ?? "")
        : a[sortKey].localeCompare(b[sortKey]);
      return sortDescending ? -value : value;
    });
  }, [centers, districtFilter, search, sortDescending, sortKey, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredCenters.length / pageSize));
  const pageCenters = filteredCenters.slice((page - 1) * pageSize, page * pageSize);

  const districtOptions = useMemo(
    () => PREVIEW_DISTRICTS.map((district) => ({
      value: district.id,
      label: district.name_en,
      hint: district.code,
    })),
    [],
  );

  const uploadColumns = useMemo<BulkUploadColumn[]>(() => [
    { key: "code", label: "Center Code", required: true, validate: (value) => { const result = centerCode.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V003"); } },
    { key: "name_en", label: "Center Name", required: true, validate: (value) => { const result = englishLabel.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V038"); } },
    { key: "name_hi", label: "Center Name (Hindi)", validate: (value) => { if (!value) return null; const result = hindiText.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V035"); } },
    { key: "district_lgd_code", label: "District LGD Code", required: true, validate: (value) => { const result = lgdCode.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V027"); } },
    { key: "center_type", label: "Center Type", required: true, type: "dropdown", options: CENTER_TYPE_VALUES, validate: (value) => { const result = centerType.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V040"); } },
    { key: "soch_facility_code", label: "SOCH Facility Code", validate: (value) => { if (!value) return null; const result = sochBeneficiaryId.safeParse(value); return result.success ? null : validationText(result.error.issues[0]?.message ?? "V025"); } },
  ], [validationText]);

  function beginCreate() {
    setEditingCenter(null);
    form.reset(EMPTY_FORM);
    setDialogOpen(true);
  }

  function beginEdit(center: Center) {
    setEditingCenter(center);
    form.reset({
      code: center.code,
      name_en: center.name_en,
      name_hi: center.name_hi ?? "",
      district_id: center.district?.id ?? "",
      center_type: center.center_type,
      soch_facility_code: center.soch_facility_code ?? "",
    });
    setDialogOpen(true);
  }

  function submitCenter(values: CenterFormValues) {
    const input: PreviewCenterInput = {
      code: values.code,
      name_en: values.name_en,
      name_hi: values.name_hi || null,
      district_id: values.district_id,
      center_type: values.center_type,
      soch_facility_code: values.soch_facility_code || null,
    };
    if (editingCenter) {
      const district = districtById(input.district_id);
      if (!district) {
        form.setError("district_id", { type: "validate", message: t("selectDistrict") });
        return;
      }
      savePreviewCenter({
        ...editingCenter,
        ...input,
        district: { id: district.id, code: district.code, name_en: district.name_en, name_hi: district.name_hi },
        updated_at: new Date().toISOString(),
      });
      toast.success(t("saved"));
    } else {
      if (centers.some((center) => center.code === input.code)) {
        form.setError("code", { type: "validate", message: t("duplicateCode") });
        return;
      }
      upsertPreviewCenters([input]);
      toast.success(t("created"));
    }
    setDialogOpen(false);
    setEditingCenter(null);
  }

  function changeCenterStatus(center: Center) {
    const activate = !center.is_active;
    confirm(
      {
        title: t(activate ? "activateTitle" : "deactivateTitle", { code: center.code }),
        description: t(activate ? "activateText" : "deactivateText"),
        variant: activate ? "success" : "warning",
        confirmText: t(activate ? "activate" : "deactivate"),
      },
      () => {
        setPreviewCenterActive(center.id, activate);
        toast.success(t(activate ? "activated" : "deactivated"));
      },
    );
  }

  function handleSearch(value: string) {
    setSearchInput(value);
    if (!value) {
      setSearch("");
      setSearchError("");
      setPage(1);
      return;
    }
    const parsed = searchText.safeParse(value);
    if (!parsed.success) {
      setSearchError(validationText(parsed.error.issues[0]?.message));
      return;
    }
    setSearch(parsed.data);
    setSearchError("");
    setPage(1);
  }

  async function downloadTemplate() {
    const headers = ["Center Code", "Center Name", "Center Name (Hindi)", "District LGD Code", "Center Type", "SOCH Facility Code"];
    saveBlob(new Blob([`${headers.join(",")}\r\n`], { type: "text/csv;charset=utf-8" }), "demo-centers-template.csv");
  }

  async function handleMockUpload(file: File) {
    const rows = file.name.toLowerCase().endsWith(".xlsx")
      ? await parseXLSX(file)
      : await parseCSVFile(file);
    if (rows.length < 2) throw new Error(importText("emptyFile"));

    const priorCodes = new Set<string>();
    const staged: PreviewCenterInput[] = [];
    const errors: ServerRowError[] = [];
    let created = 0;
    let updated = 0;
    let unchanged = 0;

    for (const [index, values] of rows.slice(1).entries()) {
      if (values.every((value) => !value.trim())) continue;
      const result = importRowErrors(values, index + 1, priorCodes, centers);
      const rowErrors = result.errors.map((error) => ({
        ...error,
        message: error.message === "duplicate"
          ? importText("duplicateRow")
          : error.message === "district"
            ? importText("invalidDistrict")
            : validationText(error.message),
      }));
      errors.push(...rowErrors);
      if (!result.input || rowErrors.length > 0) continue;
      if (result.isUnchanged) {
        unchanged++;
      } else {
        staged.push(result.input);
        if (result.isUpdate) updated++;
        else created++;
      }
    }

    const errorRowCount = new Set(errors.map((error) => error.rowNumber)).size;
    setStagedImport({
      inputs: staged,
      valid: staged.length + unchanged,
      created,
      updated,
      unchanged,
      errors: errorRowCount,
    });
    setImportErrors(errors);
    toast.info(importText("staged", { valid: staged.length + unchanged, errors: errorRowCount }));
  }

  function confirmMockImport() {
    if (!stagedImport) return;
    upsertPreviewCenters(stagedImport.inputs);
    toast.success(importText("committed", {
      created: stagedImport.created,
      updated: stagedImport.updated,
      unchanged: stagedImport.unchanged,
    }));
    setStagedImport(null);
    setImportErrors([]);
  }

  function cancelMockImport() {
    setStagedImport(null);
    setImportErrors([]);
    toast.success(importText("cancelled"));
  }

  function toggleSort(key: "code" | "name_en" | "district") {
    if (key === sortKey) setSortDescending((previous) => !previous);
    else {
      setSortKey(key);
      setSortDescending(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#fff8f9] text-slate-900">
      <PreviewSidebar mobileOpen={mobileMenu} onMobileOpenChange={setMobileMenu} />
      <main className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-rose-100 bg-white/95 px-5 shadow-sm backdrop-blur lg:px-7">
          <div className="flex items-center gap-3">
            <button type="button" aria-label={previewText("openMenu")} onClick={() => setMobileMenu(true)} className="rounded-lg p-2 text-slate-600 hover:bg-rose-50 lg:hidden">
              <MoreHorizontal size={20} />
            </button>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#c8102e]">Government of Rajasthan</p>
              <h1 className="mt-0.5 text-lg font-bold tracking-tight text-slate-900">Chikitsa AIDS Pension Portal</h1>
            </div>
          </div>
          <ToneBadge tone="warning">{previewText("demoTitle")}</ToneBadge>
        </header>

        <div className="p-4 sm:p-6 lg:p-7">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#c8102e]">{t("title")}</p>
            <h2 className="mt-1 text-2xl font-bold">{t("title")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
          </div>
          <p role="note" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {previewText("centerDemoNotice")}
          </p>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="min-w-56 flex-1">
              <Input
                value={searchInput}
                onChange={(event) => handleSearch(event.target.value)}
                placeholder={t("searchPlaceholder")}
                aria-invalid={!!searchError}
                aria-describedby={searchError ? "preview-center-search-error" : undefined}
              />
              {searchError && <p id="preview-center-search-error" className="mt-1 text-xs text-destructive">{searchError}</p>}
            </div>
            <FilterCombobox
              value={districtFilter}
              onChange={(value) => { setDistrictFilter(value); setPage(1); }}
              options={districtOptions}
              placeholder={t("filterDistrict")}
              allLabel={t("allDistricts")}
              emptyLabel={common("noMatch")}
              className="w-full sm:w-56"
            />
            <FilterCombobox
              value={statusFilter}
              onChange={(value) => { setStatusFilter(value); setPage(1); }}
              options={[
                { value: "true", label: common("active") },
                { value: "false", label: common("inactive") },
              ]}
              placeholder={t("filterStatus")}
              allLabel={t("allStatuses")}
              className="w-full sm:w-48"
            />
            <Button type="button" variant="outline" onClick={() => { setStagedImport(null); setImportErrors([]); setImportOpen(true); }}>
              <Upload aria-hidden />
              {t("bulkImport")}
            </Button>
            <Button type="button" onClick={beginCreate}>
              <Plus aria-hidden />
              {t("create")}
            </Button>
          </div>

          <section className="overflow-hidden rounded-xl border border-rose-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left" aria-label={t("title")}>
                <thead className="bg-[#fff8f9]">
                  <tr className="border-b border-rose-100 text-xs uppercase text-slate-500">
                    {([
                      ["code", t("code")],
                      ["name_en", t("name")],
                      ["district", t("district")],
                    ] as const).map(([key, label]) => (
                      <th key={key} className="px-4 py-3">
                        <button type="button" onClick={() => toggleSort(key)} className="font-semibold hover:text-[#c8102e]">
                          {label}{sortKey === key ? (sortDescending ? " ↓" : " ↑") : ""}
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-3">{t("type")}</th>
                    <th className="px-4 py-3">{t("sochCode")}</th>
                    <th className="px-4 py-3">{t("status")}</th>
                    <th className="px-4 py-3 text-right">{common("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {pageCenters.map((center) => (
                    <tr key={center.id} className="hover:bg-[#fffafb]">
                      <td className="px-4 py-3 text-sm font-semibold">{center.code}</td>
                      <td className="px-4 py-3 text-sm">
                        <p className="font-medium">{center.name_en}</p>
                        <p className="text-xs text-slate-500">{center.name_hi || t("noHindiName")}</p>
                      </td>
                      <td className="px-4 py-3 text-sm">{center.district?.name_en ?? t("noDistrict")}</td>
                      <td className="px-4 py-3 text-sm">{t(`types.${center.center_type}`)}</td>
                      <td className="px-4 py-3 text-sm">{center.soch_facility_code || t("notProvided")}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <ActiveBadge active={center.is_active} />
                          {center.is_placeholder && <ToneBadge tone="neutral" title={t("placeholderHint")}>{t("placeholder")}</ToneBadge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label={t("actionsFor", { code: center.code })}>
                              <MoreHorizontal aria-hidden />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => beginEdit(center)}>
                              <Pencil aria-hidden />{t("edit")}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => changeCenterStatus(center)}>
                              <Power aria-hidden />{t(center.is_active ? "deactivate" : "activate")}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {pageCenters.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <p className="font-medium">{t("emptyTitle")}</p>
                        <p className="mt-1 text-sm text-slate-500">{filteredCenters.length === 0 && centers.length > 0 ? t("noMatchText") : t("emptyText")}</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-rose-100 px-4 py-3 text-sm">
              <span className="text-slate-500">{previewText("demoRows", { count: filteredCenters.length })}</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                  {tableText("goToPreviousPage")}
                </Button>
                <span aria-live="polite">{tableText("pageOf", { current: page, total: totalPages })}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>
                  {tableText("goToNextPage")}
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {confirmDialog}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDialogOpen(false);
            setEditingCenter(null);
            form.reset(EMPTY_FORM);
          }
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingCenter ? t("editTitle", { code: editingCenter.code }) : t("createTitle")}</DialogTitle>
            <DialogDescription>{previewText("centerDemoNotice")}</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(submitCenter)} className="space-y-4">
              {!editingCenter && (
                <FormField control={form.control} name="code" render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("code")}</FormLabel>
                    <FormControl><Input autoComplete="off" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              {editingCenter && (
                <div className="space-y-2">
                  <FormLabel>{t("code")}</FormLabel>
                  <Input value={editingCenter.code} readOnly />
                  <p className="text-sm text-slate-500">{t("codeFixed")}</p>
                </div>
              )}
              <FormField control={form.control} name="name_en" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("name")}</FormLabel>
                  <FormControl><Input autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="name_hi" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("nameHi")}</FormLabel>
                  <FormControl><Input autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="district_id" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("district")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full"><SelectValue placeholder={t("selectDistrict")} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PREVIEW_DISTRICTS.map((district) => (
                        <SelectItem key={district.id} value={district.id}>{district.name_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="center_type" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("type")}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      {CENTER_TYPE_VALUES.map((value) => <SelectItem key={value} value={value}>{t(`types.${value}`)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="soch_facility_code" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("sochCode")}</FormLabel>
                  <FormControl><Input autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); setEditingCenter(null); form.reset(EMPTY_FORM); }}>
                  {common("cancel")}
                </Button>
                <Button type="submit">{common("save")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <BulkUploadSheet
        open={importOpen}
        onOpenChange={setImportOpen}
        title={importText("title")}
        description={importText("description")}
        columns={uploadColumns}
        fileName="demo-centers.csv"
        onUpload={handleMockUpload}
        onDownloadTemplate={() => void downloadTemplate()}
        serverErrors={importErrors}
        summary={stagedImport ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-semibold">{importText("demoNote")}</p>
            <p>{importText("staged", { valid: stagedImport.valid, errors: stagedImport.errors })}</p>
            <p>{importText("rows")}: {stagedImport.valid + stagedImport.errors}, {importText("create")}: {stagedImport.created}, {importText("update")}: {stagedImport.updated}, {importText("unchanged")}: {stagedImport.unchanged}, {importText("duplicates")}: {importErrors.filter((error) => error.field === "code" && error.message === importText("duplicateRow")).length}</p>
          </div>
        ) : undefined}
        confirmLabel={importText("confirm")}
        onConfirm={stagedImport ? confirmMockImport : undefined}
        canConfirm={!!stagedImport && stagedImport.valid > 0}
        onCancelImport={cancelMockImport}
      />
    </div>
  );
}
