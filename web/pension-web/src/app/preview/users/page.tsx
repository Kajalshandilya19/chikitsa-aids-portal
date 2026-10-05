"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { MoreHorizontal, Plus, UserRoundCog } from "lucide-react";
import { z } from "zod";

import { PreviewSidebar } from "@/components/preview/preview-sidebar";
import { FilterCombobox, ANY_VALUE } from "@/components/inputs/filter-combobox";
import { ActiveBadge } from "@/components/common/active-badge";
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
import { ToneBadge } from "@/components/ui/tone-badge";
import { useConfirm } from "@/hooks/use-confirm";
import { usePreviewUsers } from "@/hooks/use-preview-users";
import { useValidationText } from "@/hooks/use-validation-text";
import type { UserAssignment, UserRow } from "@/lib/api-types";
import {
  addPreviewUserAssignment,
  createPreviewUser,
  editPreviewUser,
  PREVIEW_USER_ROLES,
  removePreviewUserAssignment,
  resetPreviewUserPassword,
  setPreviewUserActive,
  unlockPreviewUser,
} from "@/lib/preview/users";
import { PREVIEW_CENTERS, PREVIEW_DISTRICTS } from "@/lib/preview/centers";
import { blankOr } from "@/lib/forms";
import { email, mobile, personName, searchText, userCode, uuid } from "@/lib/shared/validators";

const createSchema = z.object({
  user_code: userCode,
  full_name: personName,
  mobile,
  email: blankOr(email),
  role_id: uuid,
  district_id: blankOr(uuid),
  center_id: blankOr(uuid),
});
const editSchema = z.object({
  full_name: personName,
  mobile: blankOr(mobile),
  email: blankOr(email),
});
const assignmentSchema = z.object({
  role_id: uuid,
  district_id: blankOr(uuid),
  center_id: blankOr(uuid),
});

type CreateValues = z.input<typeof createSchema>;
type EditValues = z.input<typeof editSchema>;
type AssignmentValues = z.input<typeof assignmentSchema>;

const EMPTY_CREATE: CreateValues = {
  user_code: "",
  full_name: "",
  mobile: "",
  email: "",
  role_id: "",
  district_id: "",
  center_id: "",
};
const EMPTY_ASSIGNMENT: AssignmentValues = { role_id: "", district_id: "", center_id: "" };

function placeFor(assignment: UserAssignment, stateLabel: string, unavailable: string) {
  if (assignment.scope === "STATE") return stateLabel;
  if (assignment.scope === "DISTRICT") return assignment.district_name_en || unavailable;
  if (assignment.scope === "CENTER") return assignment.center_code || unavailable;
  return unavailable;
}

function makeDemoPassword() {
  return `Demo!${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export default function PreviewUsersPage() {
  const t = useTranslations("users");
  const previewText = useTranslations("preview");
  const tableText = useTranslations("dataTable");
  const common = useTranslations("common");
  const workspace = useTranslations("workspace");
  const validationText = useValidationText();
  const users = usePreviewUsers();
  const [confirmDialog, confirm] = useConfirm();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchError, setSearchError] = useState("");
  const [roleFilter, setRoleFilter] = useState(ANY_VALUE);
  const [districtFilter, setDistrictFilter] = useState(ANY_VALUE);
  const [centerFilter, setCenterFilter] = useState(ANY_VALUE);
  const [activeFilter, setActiveFilter] = useState(ANY_VALUE);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [managingUser, setManagingUser] = useState<UserRow | null>(null);
  const [oneTimePassword, setOneTimePassword] = useState<{ userCode: string; value: string } | null>(null);

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: EMPTY_CREATE,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: "", mobile: "", email: "" },
  });
  const assignmentForm = useForm<AssignmentValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: EMPTY_ASSIGNMENT,
  });

  const filteredUsers = useMemo(() => users.filter((user) => {
    const query = search.toLowerCase();
    const matchesText = !query || `${user.user_code} ${user.full_name} ${user.mobile_masked ?? ""} ${user.email_masked ?? ""}`.toLowerCase().includes(query);
    const matchesRole = roleFilter === ANY_VALUE || user.assignments.some((assignment) => assignment.role_code === roleFilter);
    const matchesDistrict = districtFilter === ANY_VALUE || user.assignments.some((assignment) => assignment.district_id === districtFilter);
    const matchesCenter = centerFilter === ANY_VALUE || user.assignments.some((assignment) => assignment.center_id === centerFilter);
    const matchesActive = activeFilter === ANY_VALUE || String(user.is_active) === activeFilter;
    return matchesText && matchesRole && matchesDistrict && matchesCenter && matchesActive;
  }), [activeFilter, centerFilter, districtFilter, roleFilter, search, users]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const pageUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);
  const districtOptions = PREVIEW_DISTRICTS.map((district) => ({ value: district.id, label: district.name_en }));
  const centerOptions = PREVIEW_CENTERS.map((center) => ({ value: center.id, label: center.name_en, hint: center.code }));
  const roleOptions = PREVIEW_USER_ROLES.map((role) => ({ value: role.code, label: role.name_en, hint: role.scope_level }));
  const createRoleId = useWatch({ control: createForm.control, name: "role_id" });
  const createRole = PREVIEW_USER_ROLES.find((candidate) => candidate.id === createRoleId);
  const assignmentRoleId = useWatch({ control: assignmentForm.control, name: "role_id" });
  const assignmentRole = PREVIEW_USER_ROLES.find((candidate) => candidate.id === assignmentRoleId);
  const editTarget = editingUser;

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

  function openEdit(user: UserRow) {
    setEditingUser(user);
    editForm.reset({ full_name: user.full_name, mobile: "", email: "" });
  }

  function createUser(values: CreateValues) {
    const role = PREVIEW_USER_ROLES.find((candidate) => candidate.id === values.role_id);
    if (!role) {
      createForm.setError("role_id", { type: "validate", message: t("selectRole") });
      return;
    }
    if (role.scope_level === "DISTRICT" && !values.district_id) {
      createForm.setError("district_id", { type: "validate", message: t("selectDistrict") });
      return;
    }
    if (role.scope_level === "CENTER" && !values.center_id) {
      createForm.setError("center_id", { type: "validate", message: t("selectCenter") });
      return;
    }
    try {
      const created = createPreviewUser(values);
      setCreateOpen(false);
      createForm.reset(EMPTY_CREATE);
      setOneTimePassword({ userCode: created.user_code, value: makeDemoPassword() });
      toast.success(t("createdDemo"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : common("genericError"));
    }
  }

  function saveEdit(values: EditValues) {
    if (!editTarget) return;
    editPreviewUser(editTarget.id, values);
    setEditingUser(null);
    toast.success(t("savedDemo"));
  }

  function openAssignments(user: UserRow) {
    setManagingUser(user);
    assignmentForm.reset(EMPTY_ASSIGNMENT);
  }

  function addAssignment(values: AssignmentValues) {
    if (!managingUser) return;
    const role = PREVIEW_USER_ROLES.find((candidate) => candidate.id === values.role_id);
    if (!role) {
      assignmentForm.setError("role_id", { type: "validate", message: t("selectRole") });
      return;
    }
    if (role.scope_level === "DISTRICT" && !values.district_id) {
      assignmentForm.setError("district_id", { type: "validate", message: t("selectDistrict") });
      return;
    }
    if (role.scope_level === "CENTER" && !values.center_id) {
      assignmentForm.setError("center_id", { type: "validate", message: t("selectCenter") });
      return;
    }
    const duplicate = managingUser.assignments.some((assignment) =>
      assignment.role_id === role.id &&
      assignment.district_id === (values.district_id || null) &&
      assignment.center_id === (values.center_id || null),
    );
    if (duplicate) {
      toast.error(t("duplicateAssignment"));
      return;
    }
    addPreviewUserAssignment(managingUser.id, values.role_id, values.district_id, values.center_id);
    assignmentForm.reset(EMPTY_ASSIGNMENT);
    toast.success(t("assignmentAddedDemo"));
  }

  function statusAction(user: UserRow, action: "activate" | "deactivate" | "unlock" | "reset") {
    confirm(
      {
        title: t(`${action}Title`, { userCode: user.user_code }),
        description: t(`${action}Text`),
        variant: action === "deactivate" ? "warning" : action === "activate" ? "success" : "info",
        confirmText: t(action === "reset" ? "resetPassword" : action),
      },
      () => {
        if (action === "activate" || action === "deactivate") {
          setPreviewUserActive(user.id, action === "activate");
          toast.success(t(action === "activate" ? "activatedDemo" : "deactivatedDemo"));
        } else if (action === "unlock") {
          unlockPreviewUser(user.id);
          toast.success(t("unlockedDemo"));
        } else {
          resetPreviewUserPassword(user.id);
          setOneTimePassword({ userCode: user.user_code, value: makeDemoPassword() });
        }
      },
    );
  }

  return (
    <div className="min-h-screen bg-[#fff8f9] text-slate-900">
      <PreviewSidebar mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} />
      <main className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-[78px] items-center justify-between border-b border-rose-100 bg-white/95 px-5 shadow-sm backdrop-blur lg:px-7">
          <div className="flex items-center gap-3">
            <button type="button" aria-label={previewText("openMenu")} onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-rose-50 lg:hidden">
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
            {previewText("usersDemoNotice")}
          </p>

          <div className="mb-4 flex flex-wrap items-start gap-2">
            <div className="min-w-56 flex-1">
              <Input value={searchInput} onChange={(event) => handleSearch(event.target.value)} placeholder={t("previewSearchPlaceholder")} aria-invalid={!!searchError} />
              {searchError && <p className="mt-1 text-xs text-destructive">{searchError}</p>}
            </div>
            <FilterCombobox value={roleFilter} onChange={(value) => { setRoleFilter(value); setPage(1); }} options={roleOptions} placeholder={t("role")} allLabel={t("allRoles")} emptyLabel={common("noMatch")} className="w-full sm:w-52" />
            <FilterCombobox value={districtFilter} onChange={(value) => { setDistrictFilter(value); setPage(1); }} options={districtOptions} placeholder={t("district")} allLabel={t("allDistricts")} emptyLabel={common("noMatch")} className="w-full sm:w-52" />
            <FilterCombobox value={centerFilter} onChange={(value) => { setCenterFilter(value); setPage(1); }} options={centerOptions} placeholder={t("center")} allLabel={t("allCenters")} emptyLabel={common("noMatch")} className="w-full sm:w-52" />
            <FilterCombobox value={activeFilter} onChange={(value) => { setActiveFilter(value); setPage(1); }} options={[{ value: "true", label: common("active") }, { value: "false", label: common("inactive") }]} placeholder={t("status")} allLabel={t("allStatuses")} emptyLabel={common("noMatch")} className="w-full sm:w-48" />
            <Button type="button" onClick={() => { createForm.reset(EMPTY_CREATE); setCreateOpen(true); }}>
              <Plus aria-hidden />{t("create")}
            </Button>
          </div>

          <section className="overflow-hidden rounded-xl border border-rose-100 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-left" aria-label={t("title")}>
                <thead className="bg-[#fff8f9]">
                  <tr className="border-b border-rose-100 text-xs uppercase text-slate-500">
                    <th className="px-4 py-3">{t("userId")}</th>
                    <th className="px-4 py-3">{t("fullName")}</th>
                    <th className="px-4 py-3">{t("mobile")}</th>
                    <th className="px-4 py-3">{t("email")}</th>
                    <th className="px-4 py-3">{t("assignments")}</th>
                    <th className="px-4 py-3">{t("status")}</th>
                    <th className="px-4 py-3">{t("lastLogin")}</th>
                    <th className="px-4 py-3 text-right">{common("actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-50">
                  {pageUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-[#fffafb]">
                      <td className="px-4 py-3 font-mono text-sm">{user.user_code}</td>
                      <td className="px-4 py-3 text-sm font-medium">{user.full_name}</td>
                      <td className="px-4 py-3 text-sm">{user.mobile_masked}</td>
                      <td className="px-4 py-3 text-sm">{user.email_masked || t("unavailable")}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-1">
                          {user.assignments.map((assignment) => (
                            <p key={assignment.id}>
                              {assignment.role_name_en} · {placeFor(assignment, workspace("scope.STATE"), t("unavailable"))}
                            </p>
                          ))}
                          {user.assignments.length === 0 && <span className="text-slate-500">{t("noAssignments")}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <ActiveBadge active={user.is_active} />
                          {user.is_locked && <ToneBadge tone="warning">{t("locked")}</ToneBadge>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">{user.last_login_at ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(user.last_login_at)) : t("never")}</td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" aria-label={t("actionsFor", { userCode: user.user_code })}><MoreHorizontal aria-hidden /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => openEdit(user)}>{t("edit")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => openAssignments(user)}>{t("manageAssignments")}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.is_locked && <DropdownMenuItem onSelect={() => statusAction(user, "unlock")}>{t("unlock")}</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => statusAction(user, user.is_active ? "deactivate" : "activate")}>{t(user.is_active ? "deactivate" : "activate")}</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => statusAction(user, "reset")}>{t("resetPassword")}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {pageUsers.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center">
                      <UserRoundCog className="mx-auto mb-2 size-8 text-slate-400" aria-hidden />
                      <p className="font-medium">{t("emptyTitle")}</p>
                      <p className="mt-1 text-sm text-slate-500">{filteredUsers.length === 0 && users.length > 0 ? t("noMatchText") : t("emptyText")}</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-rose-100 px-4 py-3 text-sm">
              <span className="text-slate-500">{t("demoUsers", { count: filteredUsers.length })}</span>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>{tableText("goToPreviousPage")}</Button>
                <span aria-live="polite">{tableText("pageOf", { current: page, total: totalPages })}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>{tableText("goToNextPage")}</Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      {confirmDialog}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); createForm.reset(EMPTY_CREATE); } }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{t("createTitle")}</DialogTitle><DialogDescription>{t("createDescription")}</DialogDescription></DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(createUser)} className="space-y-4">
              <FormField control={createForm.control} name="user_code" render={({ field }) => (
                <FormItem><FormLabel required>{t("userId")}</FormLabel><FormControl><Input autoComplete="off" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="full_name" render={({ field }) => (
                <FormItem><FormLabel required>{t("fullName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="mobile" render={({ field }) => (
                <FormItem><FormLabel required>{t("mobile")}</FormLabel><FormControl><Input type="tel" autoComplete="off" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={createForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>{t("email")}</FormLabel><FormControl><Input type="email" autoComplete="off" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="border-t pt-4">
                <h3 className="mb-3 text-sm font-semibold">{t("initialAssignment")}</h3>
                <FormField control={createForm.control} name="role_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("role")}</FormLabel>
                    <Select value={field.value} onValueChange={(id) => { createForm.setValue("role_id", id); createForm.setValue("district_id", ""); createForm.setValue("center_id", ""); }}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectRole")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PREVIEW_USER_ROLES.map((role) => <SelectItem key={role.id} value={role.id}>{role.name_en} · {role.scope_level}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {createRole?.scope_level === "DISTRICT" && (
                  <FormField control={createForm.control} name="district_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("district")}</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectDistrict")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PREVIEW_DISTRICTS.map((district) => <SelectItem key={district.id} value={district.id}>{district.name_en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                {createRole?.scope_level === "CENTER" && (
                  <FormField control={createForm.control} name="center_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("center")}</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectCenter")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PREVIEW_CENTERS.filter((center) => center.is_active).map((center) => (
                            <SelectItem key={center.id} value={center.id}>{center.name_en} ({center.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); createForm.reset(EMPTY_CREATE); }}>{common("cancel")}</Button>
                <Button type="submit">{t("create")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{t("editTitle", { userCode: editingUser?.user_code ?? "" })}</DialogTitle><DialogDescription>{t("editDescription")}</DialogDescription></DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(saveEdit)} className="space-y-4">
              <FormField control={editForm.control} name="full_name" render={({ field }) => (
                <FormItem><FormLabel required>{t("fullName")}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="mobile" render={({ field }) => (
                <FormItem><FormLabel>{t("newMobile")}</FormLabel><FormControl><Input type="tel" autoComplete="off" placeholder={t("keepBlank")} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>{t("newEmail")}</FormLabel><FormControl><Input type="email" autoComplete="off" placeholder={t("keepBlank")} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>{common("cancel")}</Button>
                <Button type="submit">{common("save")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingUser} onOpenChange={(open) => { if (!open) { setManagingUser(null); assignmentForm.reset(EMPTY_ASSIGNMENT); } }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>{t("assignmentsTitle", { userCode: managingUser?.user_code ?? "" })}</DialogTitle><DialogDescription>{previewText("usersDemoNotice")}</DialogDescription></DialogHeader>
          <div className="space-y-2">
            {(managingUser?.assignments ?? []).map((assignment) => (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <div className="text-sm">
                  <p className="font-medium">{assignment.role_name_en}</p>
                  <p className="text-muted-foreground">{placeFor(assignment, workspace("scope.STATE"), t("unavailable"))}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => confirm(
                    { title: t("removeAssignmentTitle"), description: t("removeAssignmentText", { role: assignment.role_name_en ?? t("role"), place: placeFor(assignment, workspace("scope.STATE"), t("unavailable")) }), variant: "warning", confirmText: t("remove") },
                    () => { if (managingUser) { removePreviewUserAssignment(managingUser.id, assignment.id); toast.success(t("assignmentRemovedDemo")); } },
                  )}
                >
                  {t("remove")}
                </Button>
              </div>
            ))}
            {(managingUser?.assignments.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">{t("noAssignments")}</p>}
          </div>
          <div className="border-t pt-4">
            <h3 className="mb-3 text-sm font-semibold">{t("addAssignment")}</h3>
            <Form {...assignmentForm}>
              <form onSubmit={assignmentForm.handleSubmit(addAssignment)} className="space-y-4">
                <FormField control={assignmentForm.control} name="role_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("role")}</FormLabel>
                    <Select value={field.value} onValueChange={(id) => { assignmentForm.setValue("role_id", id); assignmentForm.setValue("district_id", ""); assignmentForm.setValue("center_id", ""); }}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectRole")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {PREVIEW_USER_ROLES.map((role) => <SelectItem key={role.id} value={role.id}>{role.name_en} · {role.scope_level}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {assignmentRole?.scope_level === "DISTRICT" && (
                  <FormField control={assignmentForm.control} name="district_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("district")}</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectDistrict")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PREVIEW_DISTRICTS.map((district) => <SelectItem key={district.id} value={district.id}>{district.name_en}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                {assignmentRole?.scope_level === "CENTER" && (
                  <FormField control={assignmentForm.control} name="center_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("center")}</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectCenter")} /></SelectTrigger></FormControl>
                        <SelectContent>
                          {PREVIEW_CENTERS.filter((center) => center.is_active).map((center) => (
                            <SelectItem key={center.id} value={center.id}>{center.name_en} ({center.code})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                <div className="flex justify-end">
                  <Button type="submit">{t("addAssignment")}</Button>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!oneTimePassword} onOpenChange={(open) => { if (!open) setOneTimePassword(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("tempTitle")}</DialogTitle><DialogDescription>{t("tempFor", { userCode: oneTimePassword?.userCode ?? "" })}</DialogDescription></DialogHeader>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{previewText("previewPasswordNotice")}</p>
          <Input aria-label={t("tempTitle")} readOnly value={oneTimePassword?.value ?? ""} className="font-mono" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={async () => {
              if (!oneTimePassword) return;
              try {
                await navigator.clipboard.writeText(oneTimePassword.value);
                toast.success(t("tempCopied"));
              } catch {
                toast.error(t("copyFailed"));
              }
            }}>{t("copyPassword")}</Button>
            <Button type="button" onClick={() => setOneTimePassword(null)}>{t("tempDone")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
