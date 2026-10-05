"use client";

import { useCallback, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { MoreHorizontal, Plus, ShieldAlert } from "lucide-react";
import { z } from "zod";

import { FilterCombobox, ANY_VALUE } from "@/components/inputs/filter-combobox";
import { ActiveBadge } from "@/components/common/active-badge";
import { PageHeader } from "@/components/dashboard/page-header";
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
import { ServerDataTable } from "@/components/ui/server-data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToneBadge } from "@/components/ui/tone-badge";
import { useApiErrorText } from "@/hooks/use-api-error-text";
import { useCenterSearch, useDistricts, useRoles } from "@/hooks/use-masters";
import { useServerTable } from "@/hooks/use-server-table";
import { useConfirm } from "@/hooks/use-confirm";
import type {
  TemporaryPasswordResult,
  UserAssignment,
  UserCreateResult,
  UserRow,
} from "@/lib/api-types";
import { ApiError, api, fieldErrors, gw, type QueryParams } from "@/lib/client/api";
import { email, mobile, personName, userCode, uuid } from "@/lib/shared/validators";
import { P, ROLE } from "@/lib/shared/permission-codes";
import { blankOr } from "@/lib/forms";
import { useSession } from "@/providers/session-provider";

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
type CreateField = keyof CreateValues;
type EditField = keyof EditValues;

const EMPTY_CREATE: CreateValues = {
  user_code: "",
  full_name: "",
  mobile: "",
  email: "",
  role_id: "",
  district_id: "",
  center_id: "",
};
const EMPTY_ASSIGNMENT: AssignmentValues = {
  role_id: "",
  district_id: "",
  center_id: "",
};

const CREATE_FIELD_MAP: Partial<Record<string, CreateField>> = {
  user_code: "user_code",
  full_name: "full_name",
  mobile: "mobile",
  email: "email",
};
const EDIT_FIELD_MAP: Partial<Record<string, EditField>> = {
  full_name: "full_name",
  mobile: "mobile",
  email: "email",
};

const dateFormatter = (locale: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

function assignmentPlace(assignment: UserAssignment, stateLabel: string, unavailable: string) {
  if (assignment.scope === "STATE") return stateLabel;
  if (assignment.scope === "DISTRICT") return assignment.district_name_en || unavailable;
  if (assignment.scope === "CENTER") return assignment.center_code || unavailable;
  return unavailable;
}

export default function UsersPage() {
  const t = useTranslations("users");
  const common = useTranslations("common");
  const workspaceText = useTranslations("workspace");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { can, user: currentUser } = useSession();
  const errorText = useApiErrorText();
  const [confirmDialog, confirm] = useConfirm();
  const [roleFilter, setRoleFilter] = useState(ANY_VALUE);
  const [districtFilter, setDistrictFilter] = useState(ANY_VALUE);
  const [centerFilter, setCenterFilter] = useState(ANY_VALUE);
  const [activeFilter, setActiveFilter] = useState(ANY_VALUE);
  const [centerFilterQuery, setCenterFilterQuery] = useState("");
  const [centerFilterLabel, setCenterFilterLabel] = useState("");
  const [centerPickerQuery, setCenterPickerQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [managingUser, setManagingUser] = useState<UserRow | null>(null);
  const [oneTimePassword, setOneTimePassword] = useState<{ userCode: string; password: string } | null>(null);

  const rolesQuery = useRoles();
  const districtsQuery = useDistricts();
  const filterCentersQuery = useCenterSearch(centerFilterQuery, can(P.MASTER_CENTER_VIEW));
  const pickerCentersQuery = useCenterSearch(centerPickerQuery, can(P.MASTER_CENTER_VIEW));
  const roles = rolesQuery.data ?? [];
  const districts = districtsQuery.data ?? [];
  const filterCenters = filterCentersQuery.data ?? [];
  const pickerCenters = pickerCentersQuery.data ?? [];

  const filters = useMemo<QueryParams>(() => ({
    ...(roleFilter !== ANY_VALUE ? { role_code: roleFilter } : {}),
    ...(districtFilter !== ANY_VALUE ? { district_id: districtFilter } : {}),
    ...(centerFilter !== ANY_VALUE ? { center_id: centerFilter } : {}),
    ...(activeFilter !== ANY_VALUE ? { is_active: activeFilter } : {}),
  }), [activeFilter, centerFilter, districtFilter, roleFilter]);

  const table = useServerTable<UserRow>(gw("auth", "users"), filters, { search: true, pageSize: 20 });

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: EMPTY_CREATE,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { full_name: "", mobile: "", email: "" },
    mode: "onSubmit",
    reValidateMode: "onChange",
  });
  const assignmentForm = useForm<AssignmentValues>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: EMPTY_ASSIGNMENT,
    mode: "onSubmit",
    reValidateMode: "onChange",
  });

  const assignmentRoleId = useWatch({ control: assignmentForm.control, name: "role_id" });
  const assignmentRole = roles.find((role) => role.id === assignmentRoleId);
  const createRoleId = useWatch({ control: createForm.control, name: "role_id" });
  const createRole = roles.find((role) => role.id === createRoleId);
  const assignableRoles = roles.filter((role) => role.assignable);
  const roleOptions = roles.map((role) => ({
    value: role.code,
    label: locale === "hi" ? role.name_hi ?? role.name_en : role.name_en,
    hint: role.scope_level,
  }));
  const districtOptions = districts.filter((district) => district.is_active).map((district) => ({
    value: district.id,
    label: district.name_en,
    hint: String(district.lgd_code),
  }));
  const centerFilterOptions = filterCenters.filter((center) => center.is_active).map((center) => ({
    value: center.id,
    label: center.name_en,
    hint: center.code,
  }));
  const assignmentsQuery = useQuery({
    queryKey: ["user-assignments", managingUser?.id],
    queryFn: () => api.get<UserAssignment[]>(gw("auth", `users/${managingUser!.id}/assignments`)),
    enabled: !!managingUser,
  });

  const invalidateUsers = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [gw("auth", "users")] }),
      managingUser
        ? queryClient.invalidateQueries({ queryKey: ["user-assignments", managingUser.id] })
        : Promise.resolve(),
    ]);
  };

  const createUser = useMutation({
    mutationFn: (values: CreateValues) => {
      const role = roles.find((candidate) => candidate.id === values.role_id);
      if (!role?.assignable) throw new Error("Select an assignable role.");
      const assignment: { role_id: string; district_id?: string; center_id?: string } = { role_id: role.id };
      if (role.scope_level === "DISTRICT") {
        if (!values.district_id) throw new Error(t("selectDistrict"));
        assignment.district_id = values.district_id;
      } else if (role.scope_level === "CENTER") {
        if (!values.center_id) throw new Error(t("selectCenter"));
        assignment.center_id = values.center_id;
      }
      return api.post<UserCreateResult>(gw("auth", "users"), {
        user_code: values.user_code,
        full_name: values.full_name,
        mobile: values.mobile,
        ...(values.email ? { email: values.email } : {}),
        assignment,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: [gw("auth", "users")] });
      setCreateOpen(false);
      createForm.reset(EMPTY_CREATE);
      setOneTimePassword({ userCode: result.user.user_code, password: result.temporary_password });
    },
    onError: (error: unknown) => {
      for (const [field, message] of Object.entries(fieldErrors(error))) {
        const target = CREATE_FIELD_MAP[field];
        if (target) createForm.setError(target, { message });
      }
      toast.error(errorText(error));
    },
  });

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { full_name?: string; mobile?: string; email?: string } }) =>
      api.patch<UserRow>(gw("auth", `users/${id}`), patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [gw("auth", "users")] });
      setEditingUser(null);
      toast.success(t("saved"));
    },
    onError: (error: unknown) => {
      for (const [field, message] of Object.entries(fieldErrors(error))) {
        const target = EDIT_FIELD_MAP[field];
        if (target) editForm.setError(target, { message });
      }
      toast.error(errorText(error));
    },
  });

  const userAction = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "activate" | "deactivate" | "unlock" | "password-reset" }) =>
      api.post<TemporaryPasswordResult | { id: string }>(gw("auth", `users/${id}/${action}`), {}),
    onSuccess: async (result, variables) => {
      await queryClient.invalidateQueries({ queryKey: [gw("auth", "users")] });
      const user = table.rows.find((row) => row.id === variables.id);
      if (variables.action === "password-reset" && "temporary_password" in result && user) {
        setOneTimePassword({ userCode: user.user_code, password: result.temporary_password });
      } else {
        toast.success(t(variables.action === "activate" ? "activated" : variables.action === "deactivate" ? "deactivated" : "unlocked"));
      }
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  });

  const addAssignment = useMutation({
    mutationFn: ({ id, values }: { id: string; values: AssignmentValues }) => {
      const role = roles.find((candidate) => candidate.id === values.role_id);
      if (!role?.assignable) throw new Error("Select an assignable role.");
      const body: { role_id: string; district_id?: string; center_id?: string } = { role_id: role.id };
      if (role.scope_level === "DISTRICT") {
        if (!values.district_id) throw new Error(t("selectDistrict"));
        body.district_id = values.district_id;
      } else if (role.scope_level === "CENTER") {
        if (!values.center_id) throw new Error(t("selectCenter"));
        body.center_id = values.center_id;
      }
      return api.post<UserAssignment[]>(gw("auth", `users/${id}/assignments`), body);
    },
    onSuccess: async () => {
      await invalidateUsers();
      assignmentForm.reset(EMPTY_ASSIGNMENT);
      toast.success(t("assignmentAdded"));
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  });

  const removeAssignment = useMutation({
    mutationFn: ({ userId, assignmentId }: { userId: string; assignmentId: string }) =>
      api.del<UserAssignment[]>(gw("auth", `users/${userId}/assignments/${assignmentId}`)),
    onSuccess: async () => {
      await invalidateUsers();
      toast.success(t("assignmentRemoved"));
    },
    onError: (error: unknown) => toast.error(errorText(error)),
  });

  function submitCreate(values: CreateValues) {
    const role = assignableRoles.find((candidate) => candidate.id === values.role_id);
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
    createUser.mutate(values);
  }

  function submitAssignment(values: AssignmentValues) {
    if (!managingUser) return;
    const role = assignableRoles.find((candidate) => candidate.id === values.role_id);
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
    addAssignment.mutate({ id: managingUser.id, values });
  }

  const targetManageable = useCallback((target: UserRow) =>
    target.id !== currentUser.id &&
    (currentUser.role?.code === ROLE.SUPER_ADMIN || !target.assignments.some((assignment) => assignment.scope === "STATE")),
  [currentUser.id, currentUser.role?.code]);

  const openEdit = useCallback((target: UserRow) => {
    setEditingUser(target);
    editForm.reset({ full_name: target.full_name, mobile: "", email: "" });
  }, [editForm]);

  function submitEdit(values: EditValues) {
    if (!editingUser) return;
    const patch: { full_name?: string; mobile?: string; email?: string } = {};
    if (values.full_name !== editingUser.full_name) patch.full_name = values.full_name;
    if (values.mobile) patch.mobile = values.mobile;
    if (values.email) patch.email = values.email;
    if (Object.keys(patch).length === 0) {
      setEditingUser(null);
      return;
    }
    updateUser.mutate({ id: editingUser.id, patch });
  }

  const openAssignments = useCallback((target: UserRow) => {
    setManagingUser(target);
    assignmentForm.reset(EMPTY_ASSIGNMENT);
    setCenterPickerQuery("");
  }, [assignmentForm]);

  function removeAssignmentWithConfirmation(target: UserRow, assignment: UserAssignment) {
    const stateLabel = workspaceText(`scope.${assignment.scope ?? "STATE"}`);
    const place = assignmentPlace(assignment, stateLabel, t("unavailable"));
    confirm(
      {
        title: t("removeAssignmentTitle"),
        description: t("removeAssignmentText", {
          role: assignment.role_name_en ?? assignment.role_code ?? t("role"),
          place,
        }),
        variant: "warning",
        confirmText: t("remove"),
      },
      () => removeAssignment.mutate({ userId: target.id, assignmentId: assignment.id }),
    );
  }

  const requestAction = useCallback((target: UserRow, action: "activate" | "deactivate" | "unlock" | "password-reset") => {
    const textKey = action === "password-reset" ? "reset" : action;
    confirm(
      {
        title: t(`${textKey}Title`, { userCode: target.user_code }),
        description: t(`${textKey}Text`),
        variant: action === "deactivate" ? "warning" : action === "activate" ? "success" : "info",
        confirmText: t(action),
      },
      () => userAction.mutate({ id: target.id, action }),
    );
  }, [confirm, t, userAction]);

  const columns = useMemo<ColumnDef<UserRow>[]>(() => {
    const definitions: ColumnDef<UserRow>[] = [
      { accessorKey: "user_code", header: t("userId"), cell: ({ row }) => <span className="font-mono text-sm">{row.original.user_code}</span> },
      {
        accessorKey: "full_name",
        header: t("fullName"),
        cell: ({ row }) => <span className="font-medium">{row.original.full_name}</span>,
      },
      { accessorKey: "mobile_masked", header: t("mobile"), enableSorting: false, cell: ({ row }) => row.original.mobile_masked || t("unavailable") },
      { accessorKey: "email_masked", header: t("email"), enableSorting: false, cell: ({ row }) => row.original.email_masked || t("unavailable") },
      {
        id: "assignments",
        header: t("assignments"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="min-w-44 space-y-1">
            {row.original.assignments.length
              ? row.original.assignments.map((assignment) => (
                <p key={assignment.id} className="text-xs">
                  <span className="font-medium">{locale === "hi" ? assignment.role_name_hi ?? assignment.role_name_en ?? assignment.role_code : assignment.role_name_en ?? assignment.role_code}</span>
                  <span className="text-muted-foreground"> · {assignmentPlace(assignment, workspaceText(`scope.${assignment.scope ?? "STATE"}`), t("unavailable"))}</span>
                </p>
              ))
              : <span className="text-xs text-muted-foreground">{t("noAssignments")}</span>}
          </div>
        ),
      },
      {
        id: "status",
        header: t("status"),
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <ActiveBadge active={row.original.is_active} />
            {row.original.is_locked && <ToneBadge tone="warning">{t("locked")}</ToneBadge>}
          </div>
        ),
      },
      {
        accessorKey: "last_login_at",
        header: t("lastLogin"),
        enableSorting: false,
        cell: ({ row }) => row.original.last_login_at
          ? dateFormatter(locale).format(new Date(row.original.last_login_at))
          : t("never"),
      },
    ];

    if (can(
      P.USER_ACCOUNT_EDIT,
      P.USER_ASSIGNMENT_MANAGE,
      P.USER_ACCOUNT_PASSWORD_RESET,
      P.USER_ACCOUNT_ACTIVATE,
    )) {
      definitions.push({
        id: "actions",
        header: common("actions"),
        enableSorting: false,
        cell: ({ row }) => {
          const target = row.original;
          const manageable = targetManageable(target);
          const actionItems = [
            can(P.USER_ACCOUNT_EDIT) && manageable
              ? <DropdownMenuItem key="edit" onSelect={() => openEdit(target)}>{t("edit")}</DropdownMenuItem>
              : null,
            can(P.USER_ASSIGNMENT_MANAGE) && manageable
              ? <DropdownMenuItem key="assignments" onSelect={() => openAssignments(target)}>{t("manageAssignments")}</DropdownMenuItem>
              : null,
            can(P.USER_ACCOUNT_PASSWORD_RESET) && manageable
              ? <DropdownMenuItem key="reset" onSelect={() => requestAction(target, "password-reset")}>{t("resetPassword")}</DropdownMenuItem>
              : null,
            can(P.USER_ACCOUNT_ACTIVATE) && manageable && target.is_locked
              ? <DropdownMenuItem key="unlock" onSelect={() => requestAction(target, "unlock")}>{t("unlock")}</DropdownMenuItem>
              : null,
            can(P.USER_ACCOUNT_ACTIVATE) && manageable
              ? <DropdownMenuItem key="status" onSelect={() => requestAction(target, target.is_active ? "deactivate" : "activate")}>
                {t(target.is_active ? "deactivate" : "activate")}
              </DropdownMenuItem>
              : null,
          ].filter(Boolean);

          if (actionItems.length === 0) return <span className="text-xs text-muted-foreground">{t("noActions")}</span>;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("actionsFor", { userCode: target.user_code })}>
                  <MoreHorizontal aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {actionItems.map((item, index) => (
                  <span key={index}>
                    {index > 0 && <DropdownMenuSeparator />}
                    {item}
                  </span>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      });
    }
    return definitions;
  }, [can, common, locale, t, workspaceText, targetManageable, openEdit, openAssignments, requestAction]);

  const requestErrorId = table.query.error instanceof ApiError ? table.query.error.requestId : null;

  return (
    <>
      <div className="flex h-full min-h-0 flex-col gap-4">
        <PageHeader
          title={t("title")}
          description={t("description")}
          actions={can(P.USER_ACCOUNT_CREATE) ? (
            <Button
              type="button"
              onClick={() => {
                createForm.reset(EMPTY_CREATE);
                setCenterPickerQuery("");
                setCreateOpen(true);
              }}
            >
              <Plus aria-hidden />
              {t("create")}
            </Button>
          ) : undefined}
        />

        <div className="flex flex-wrap items-center gap-2">
          {can(P.ROLE_CATALOGUE_VIEW, P.USER_ASSIGNMENT_MANAGE) && (
            <FilterCombobox
              value={roleFilter}
              onChange={setRoleFilter}
              options={roleOptions}
              placeholder={t("role")}
              allLabel={t("allRoles")}
              emptyLabel={common("noMatch")}
              loading={rolesQuery.isLoading}
              className="w-full sm:w-56"
            />
          )}
          {can(P.MASTER_DISTRICT_VIEW) && (
            <FilterCombobox
              value={districtFilter}
              onChange={setDistrictFilter}
              options={districtOptions}
              placeholder={t("district")}
              allLabel={t("allDistricts")}
              emptyLabel={common("noMatch")}
              loading={districtsQuery.isLoading}
              className="w-full sm:w-56"
            />
          )}
          {can(P.MASTER_CENTER_VIEW) && (
            <FilterCombobox
              value={centerFilter}
              onChange={(value) => {
                setCenterFilter(value);
                const found = filterCenters.find((center) => center.id === value);
                setCenterFilterLabel(found?.name_en ?? "");
              }}
              options={centerFilterOptions}
              placeholder={t("center")}
              allLabel={t("allCenters")}
              emptyLabel={common("noMatch")}
              loading={filterCentersQuery.isLoading}
              onSearchChange={setCenterFilterQuery}
              searching={filterCentersQuery.isFetching}
              selectedLabel={centerFilterLabel}
              className="w-full sm:w-56"
            />
          )}
          <FilterCombobox
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { value: "true", label: common("active") },
              { value: "false", label: common("inactive") },
            ]}
            placeholder={t("status")}
            allLabel={t("allStatuses")}
            emptyLabel={common("noMatch")}
            className="w-full sm:w-48"
          />
        </div>

        <ServerDataTable
          columns={columns}
          {...table.tableProps}
          searchPlaceholder={t("searchPlaceholder")}
          emptyState={{
            icon: <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />,
            title: t("emptyTitle"),
            description: table.total === 0 ? t("emptyText") : t("noMatchText"),
            action: can(P.USER_ACCOUNT_CREATE) && table.total === 0
              ? <Button type="button" onClick={() => setCreateOpen(true)}>{t("create")}</Button>
              : undefined,
          }}
        />
        {requestErrorId && <p className="text-xs text-muted-foreground">{t("requestId", { id: requestErrorId })}</p>}
      </div>

      {confirmDialog}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) { setCreateOpen(false); createForm.reset(EMPTY_CREATE); } }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("createTitle")}</DialogTitle>
            <DialogDescription>{t("createDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form
              onSubmit={createForm.handleSubmit(submitCreate)}
              className="space-y-4"
            >
              <FormField control={createForm.control} name="user_code" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("userId")}</FormLabel>
                  <FormControl><Input autoComplete="off" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("fullName")}</FormLabel>
                  <FormControl><Input autoComplete="name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name="mobile" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("mobile")}</FormLabel>
                  <FormControl><Input type="tel" autoComplete="tel" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={createForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("email")}</FormLabel>
                  <FormControl><Input type="email" autoComplete="email" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="border-t pt-4">
                <h3 className="mb-3 text-sm font-semibold">{t("initialAssignment")}</h3>
                <FormField control={createForm.control} name="role_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t("role")}</FormLabel>
                    <Select value={field.value} onValueChange={(roleId) => {
                    createForm.setValue("role_id", roleId);
                    createForm.setValue("district_id", "");
                    createForm.setValue("center_id", "");
                    setCenterPickerQuery("");
                    }}>
                      <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectRole")} /></SelectTrigger></FormControl>
                      <SelectContent>
                        {assignableRoles.map((role) => (
                          <SelectItem key={role.id} value={role.id}>{role.name_en} · {role.scope_level}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                {createRole?.scope_level === "DISTRICT" && (
                  <FormField control={createForm.control} name="district_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("district")}</FormLabel>
                      <FormControl>
                        <FilterCombobox
                          value={field.value || ANY_VALUE}
                          onChange={(value) => field.onChange(value === ANY_VALUE ? "" : value)}
                          options={districtOptions}
                          placeholder={t("district")}
                          allLabel={t("selectDistrict")}
                          allowAny={false}
                          emptyLabel={t("unavailable")}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                {createRole?.scope_level === "CENTER" && (
                  <FormField control={createForm.control} name="center_id" render={({ field }) => (
                    <FormItem>
                      <FormLabel required>{t("center")}</FormLabel>
                      <FormControl>
                        <FilterCombobox
                          value={field.value || ANY_VALUE}
                          onChange={(value) => field.onChange(value === ANY_VALUE ? "" : value)}
                          options={pickerCenters.filter((center) => center.is_active).map((center) => ({ value: center.id, label: center.name_en, hint: center.code }))}
                          placeholder={t("center")}
                          allLabel={t("selectCenter")}
                          allowAny={false}
                          emptyLabel={t("unavailable")}
                          onSearchChange={setCenterPickerQuery}
                          searching={pickerCentersQuery.isFetching}
                          selectedLabel={pickerCenters.find((center) => center.id === field.value)?.name_en}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                )}
                {createRole?.scope_level === "STATE" && (
                  <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {t("selectDistrict")} · {t("selectCenter")}: {t("unavailable")}
                  </p>
                )}
              </div>
              {(rolesQuery.isError || districtsQuery.isError || pickerCentersQuery.isError) && (
                <p role="alert" className="text-sm text-destructive">{t("lookupFailed")}</p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => { setCreateOpen(false); createForm.reset(EMPTY_CREATE); }}>
                  {common("cancel")}
                </Button>
                <Button type="submit" disabled={createUser.isPending || assignableRoles.length === 0}>
                  {createUser.isPending ? common("loading") : t("create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null); }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("editTitle", { userCode: editingUser?.user_code ?? "" })}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(submitEdit)} className="space-y-4">
              <FormField control={editForm.control} name="full_name" render={({ field }) => (
                <FormItem>
                  <FormLabel required>{t("fullName")}</FormLabel>
                  <FormControl><Input autoComplete="name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="mobile" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newMobile")}</FormLabel>
                  <FormControl><Input type="tel" autoComplete="off" placeholder={t("keepBlank")} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={editForm.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("newEmail")}</FormLabel>
                  <FormControl><Input type="email" autoComplete="off" placeholder={t("keepBlank")} {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>{common("cancel")}</Button>
                <Button type="submit" disabled={updateUser.isPending}>{updateUser.isPending ? common("loading") : common("save")}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingUser} onOpenChange={(open) => { if (!open) { setManagingUser(null); assignmentForm.reset(EMPTY_ASSIGNMENT); } }}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("assignmentsTitle", { userCode: managingUser?.user_code ?? "" })}</DialogTitle>
            <DialogDescription>{t("assignmentsDescription")}</DialogDescription>
          </DialogHeader>
          {assignmentsQuery.isPending ? (
            <p role="status" className="py-4 text-sm text-muted-foreground">{common("loading")}</p>
          ) : assignmentsQuery.isError ? (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 p-3 text-sm">
              <p>{errorText(assignmentsQuery.error)}</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void assignmentsQuery.refetch()}>{common("retry")}</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {(assignmentsQuery.data ?? []).map((assignment) => (
                  <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div className="text-sm">
                      <p className="font-medium">{locale === "hi" ? assignment.role_name_hi ?? assignment.role_name_en ?? assignment.role_code : assignment.role_name_en ?? assignment.role_code}</p>
                      <p className="text-muted-foreground">{assignmentPlace(assignment, workspaceText(`scope.${assignment.scope ?? "STATE"}`), t("unavailable"))}</p>
                    </div>
                    {can(P.USER_ASSIGNMENT_MANAGE) && managingUser && targetManageable(managingUser) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={removeAssignment.isPending}
                        onClick={() => removeAssignmentWithConfirmation(managingUser, assignment)}
                      >
                        {t("remove")}
                      </Button>
                    )}
                  </div>
                ))}
                {(assignmentsQuery.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">{t("noAssignments")}</p>}
              </div>

              {can(P.USER_ASSIGNMENT_MANAGE) && managingUser && targetManageable(managingUser) && (
                <div className="border-t pt-4">
                  <h3 className="mb-3 text-sm font-semibold">{t("addAssignment")}</h3>
                  <Form {...assignmentForm}>
                    <form
                      onSubmit={assignmentForm.handleSubmit(submitAssignment)}
                      className="space-y-4"
                    >
                      <FormField control={assignmentForm.control} name="role_id" render={({ field }) => (
                        <FormItem>
                          <FormLabel required>{t("role")}</FormLabel>
                          <Select value={field.value} onValueChange={(roleId) => {
                          assignmentForm.setValue("role_id", roleId);
                          assignmentForm.setValue("district_id", "");
                          assignmentForm.setValue("center_id", "");
                          setCenterPickerQuery("");
                          }}>
                            <FormControl><SelectTrigger className="w-full"><SelectValue placeholder={t("selectRole")} /></SelectTrigger></FormControl>
                            <SelectContent>
                              {assignableRoles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>{role.name_en} · {role.scope_level}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      {assignmentRole?.scope_level === "DISTRICT" && (
                        <FormField control={assignmentForm.control} name="district_id" render={({ field }) => (
                          <FormItem>
                            <FormLabel required>{t("district")}</FormLabel>
                            <FormControl>
                              <FilterCombobox
                                value={field.value || ANY_VALUE}
                                onChange={(value) => field.onChange(value === ANY_VALUE ? "" : value)}
                                options={districtOptions}
                                placeholder={t("district")}
                                allLabel={t("selectDistrict")}
                                allowAny={false}
                                emptyLabel={t("unavailable")}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                      {assignmentRole?.scope_level === "CENTER" && (
                        <FormField control={assignmentForm.control} name="center_id" render={({ field }) => (
                          <FormItem>
                            <FormLabel required>{t("center")}</FormLabel>
                            <FormControl>
                              <FilterCombobox
                                value={field.value || ANY_VALUE}
                                onChange={(value) => field.onChange(value === ANY_VALUE ? "" : value)}
                                options={pickerCenters.filter((center) => center.is_active).map((center) => ({ value: center.id, label: center.name_en, hint: center.code }))}
                                placeholder={t("center")}
                                allLabel={t("selectCenter")}
                                allowAny={false}
                                emptyLabel={t("unavailable")}
                                onSearchChange={setCenterPickerQuery}
                                searching={pickerCentersQuery.isFetching}
                                selectedLabel={pickerCenters.find((center) => center.id === field.value)?.name_en}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )} />
                      )}
                      {assignmentRole?.scope_level === "STATE" && (
                        <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                          {t("selectDistrict")} · {t("selectCenter")}: {t("unavailable")}
                        </p>
                      )}
                      {(rolesQuery.isError || districtsQuery.isError || pickerCentersQuery.isError) && (
                        <p role="alert" className="text-sm text-destructive">{t("lookupFailed")}</p>
                      )}
                      <div className="flex justify-end">
                        <Button type="submit" disabled={addAssignment.isPending || assignableRoles.length === 0}>
                          {addAssignment.isPending ? common("loading") : t("addAssignment")}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!oneTimePassword} onOpenChange={(open) => { if (!open) setOneTimePassword(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("tempTitle")}</DialogTitle>
            <DialogDescription>
              {t("tempFor", { userCode: oneTimePassword?.userCode ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{t("tempWarning")}</p>
          <Input aria-label={t("tempTitle")} readOnly value={oneTimePassword?.password ?? ""} className="font-mono" />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if (!oneTimePassword) return;
                try {
                  await navigator.clipboard.writeText(oneTimePassword.password);
                  toast.success(t("tempCopied"));
                } catch {
                  toast.error(t("copyFailed"));
                }
              }}
            >
              {t("copyPassword")}
            </Button>
            <Button type="button" onClick={() => setOneTimePassword(null)}>{t("tempDone")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
