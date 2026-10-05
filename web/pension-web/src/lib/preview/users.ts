import type { UserAssignment, UserRow } from "@/lib/api-types";
import { ROLE, type ScopeLevel } from "@/lib/shared/permission-codes";
import { getPreviewCenters, PREVIEW_DISTRICTS } from "@/lib/preview/centers";

export interface PreviewRole {
  id: string;
  code: string;
  name_en: string;
  scope_level: ScopeLevel;
}

export const PREVIEW_USER_ROLES: PreviewRole[] = [
  { id: "00000000-0000-4000-8000-000000002001", code: ROLE.CENTER_WORKER, name_en: "Center Worker", scope_level: "CENTER" },
  { id: "00000000-0000-4000-8000-000000002002", code: ROLE.CENTER_INCHARGE, name_en: "Center In-charge", scope_level: "CENTER" },
  { id: "00000000-0000-4000-8000-000000002003", code: ROLE.DISTRICT_OFFICER, name_en: "District Officer", scope_level: "DISTRICT" },
];

function previewAssignment(
  id: string,
  role: PreviewRole,
  districtId?: string,
  centerId?: string,
): UserAssignment {
  const district = PREVIEW_DISTRICTS.find((item) => item.id === districtId);
  const center = getPreviewCenters().find((item) => item.id === centerId);
  return {
    id,
    role_id: role.id,
    role_code: role.code,
    role_name_en: role.name_en,
    role_name_hi: null,
    scope: role.scope_level,
    district_id: role.scope_level === "DISTRICT" ? district?.id ?? null : center?.district?.id ?? null,
    district_name_en: role.scope_level === "DISTRICT" ? district?.name_en ?? null : center?.district?.name_en ?? null,
    center_id: role.scope_level === "CENTER" ? center?.id ?? null : null,
    center_code: role.scope_level === "CENTER" ? center?.code ?? null : null,
    center_name_en: role.scope_level === "CENTER" ? center?.name_en ?? null : null,
  };
}

const demoUser = (
  id: string,
  userCode: string,
  fullName: string,
  role: PreviewRole,
  districtId?: string,
  centerId?: string,
  flags: { active?: boolean; locked?: boolean; lastLogin?: string | null } = {},
): UserRow => ({
  id,
  user_code: userCode,
  full_name: fullName,
  mobile_masked: "9••••••••01",
  email_masked: "d••••@example.test",
  is_active: flags.active ?? true,
  is_locked: flags.locked ?? false,
  mfa_enabled: role.scope_level !== "CENTER",
  must_change_password: false,
  last_login_at: flags.lastLogin === undefined ? "2026-10-04T10:30:00.000Z" : flags.lastLogin,
  assignments: [previewAssignment(`${id.slice(0, -1)}9`, role, districtId, centerId)],
});

export const PREVIEW_USERS: UserRow[] = [
  demoUser("00000000-0000-4000-8000-000000003001", "demo.worker01", "Demo Worker One", PREVIEW_USER_ROLES[0]!, undefined, "00000000-0000-4000-8000-000000001001"),
  demoUser("00000000-0000-4000-8000-000000003002", "demo.incharge02", "Demo In-charge Two", PREVIEW_USER_ROLES[1]!, undefined, "00000000-0000-4000-8000-000000001002"),
  demoUser("00000000-0000-4000-8000-000000003003", "demo.officer03", "Demo Officer Three", PREVIEW_USER_ROLES[2]!, PREVIEW_DISTRICTS[0]!.id),
  demoUser("00000000-0000-4000-8000-000000003004", "demo.locked04", "Demo Locked User", PREVIEW_USER_ROLES[0]!, undefined, "00000000-0000-4000-8000-000000001004", { locked: true }),
  demoUser("00000000-0000-4000-8000-000000003005", "demo.inactive05", "Demo Inactive User", PREVIEW_USER_ROLES[2]!, PREVIEW_DISTRICTS[1]!.id, undefined, { active: false, lastLogin: null }),
  demoUser("00000000-0000-4000-8000-000000003006", "demo.worker06", "Demo Worker Six", PREVIEW_USER_ROLES[0]!, undefined, "00000000-0000-4000-8000-000000001006"),
];

export interface PreviewUserCreateInput {
  user_code: string;
  full_name: string;
  mobile: string;
  email: string;
  role_id: string;
  district_id: string;
  center_id: string;
}

export interface PreviewUserEditInput {
  full_name: string;
  mobile: string;
  email: string;
}

let users = PREVIEW_USERS;
const listeners = new Set<() => void>();

export function getPreviewUsers(): UserRow[] {
  return users;
}

export function subscribeToPreviewUsers(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: UserRow[]) {
  users = next;
  listeners.forEach((listener) => listener());
}

function maskedMobile(value: string): string {
  return `${value.slice(0, 1)}•••••••${value.slice(-2)}`;
}

function maskedEmail(value: string): string {
  if (!value) return "";
  const [local = "", domain = "example.test"] = value.split("@");
  return `${local.slice(0, 1)}••••@${domain}`;
}

export function createPreviewUser(input: PreviewUserCreateInput): UserRow {
  const role = PREVIEW_USER_ROLES.find((item) => item.id === input.role_id);
  if (!role) throw new Error("Select a demo role.");
  const duplicateUserId = users.some((user) => user.user_code === input.user_code);
  if (duplicateUserId) throw new Error("This User ID already exists in the demo data.");

  const created: UserRow = {
    id: crypto.randomUUID(),
    user_code: input.user_code,
    full_name: input.full_name,
    mobile_masked: maskedMobile(input.mobile),
    email_masked: maskedEmail(input.email),
    is_active: true,
    is_locked: false,
    mfa_enabled: role.scope_level !== "CENTER",
    must_change_password: true,
    last_login_at: null,
    assignments: [previewAssignment(crypto.randomUUID(), role, input.district_id || undefined, input.center_id || undefined)],
  };
  publish([created, ...users]);
  return created;
}

export function editPreviewUser(id: string, input: PreviewUserEditInput): void {
  publish(users.map((user) => user.id === id
    ? {
      ...user,
      full_name: input.full_name,
      ...(input.mobile ? { mobile_masked: maskedMobile(input.mobile) } : {}),
      ...(input.email ? { email_masked: maskedEmail(input.email) } : {}),
    }
    : user));
}

export function setPreviewUserActive(id: string, isActive: boolean): void {
  publish(users.map((user) => user.id === id ? { ...user, is_active: isActive } : user));
}

export function unlockPreviewUser(id: string): void {
  publish(users.map((user) => user.id === id ? { ...user, is_locked: false } : user));
}

export function resetPreviewUserPassword(id: string): void {
  publish(users.map((user) => user.id === id
    ? { ...user, is_locked: false, must_change_password: true }
    : user));
}

export function addPreviewUserAssignment(
  userId: string,
  roleId: string,
  districtId: string,
  centerId: string,
): void {
  const role = PREVIEW_USER_ROLES.find((item) => item.id === roleId);
  if (!role) throw new Error("Select a demo role.");
  const assignment = previewAssignment(crypto.randomUUID(), role, districtId || undefined, centerId || undefined);
  publish(users.map((user) => user.id === userId
    ? { ...user, assignments: [...user.assignments, assignment] }
    : user));
}

export function removePreviewUserAssignment(userId: string, assignmentId: string): void {
  publish(users.map((user) => user.id === userId
    ? { ...user, assignments: user.assignments.filter((assignment) => assignment.id !== assignmentId) }
    : user));
}
