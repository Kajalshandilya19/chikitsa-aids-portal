/**
 * Response shapes of the services, as documented in docs/API_AUTH.md and docs/API_DATA.md.
 * Types only (no runtime code), shared by the BFF and the browser. When a contract changes, change
 * it here first and let the compiler find every screen that reads it.
 */
import type { ScopeLevel } from "@/lib/shared/permission-codes";

export interface PlaceRef {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
}

export interface RoleRef {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  scope: ScopeLevel;
}

/** GET /auth/me (API_AUTH §2). */
export interface Me {
  id: string;
  user_code: string;
  name: string;
  role: RoleRef | null;
  district: PlaceRef | null;
  center: PlaceRef | null;
  permissions: string[];
  must_change_password: boolean;
  mfa_enabled: boolean;
  assignment_count: number;
}

export interface AssignmentOption {
  id: string;
  role: RoleRef | null;
  district: PlaceRef | null;
  center: PlaceRef | null;
}

/** GET /auth/options. */
export interface SessionOptions {
  current_assignment_id: string;
  assignments: AssignmentOption[];
}

export type LoginStep = "DONE" | "MFA_REQUIRED" | "MFA_ENROLL";

/** What the BFF login routes return to the browser (never a token). */
export interface LoginResult {
  step: LoginStep;
  must_change_password?: boolean;
  needs_selection?: boolean;
  user?: Me;
  otpauth_url?: string;
  secret?: string;
}

export interface Captcha {
  image: string;
  token: string;
  expires_in: number;
}

export interface District {
  id: string;
  lgd_code: number;
  code: string;
  name_en: string;
  name_hi: string | null;
  is_active: boolean;
}

export interface Center {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  center_type: "ART" | "LAC" | "COE" | "OTHER";
  soch_facility_code: string | null;
  is_active: boolean;
  is_placeholder: boolean;
  district: PlaceRef | null;
  created_at: string;
  updated_at: string;
}

export interface UserAssignment {
  id: string;
  role_id?: string;
  role_code: string | null;
  role_name_en: string | null;
  role_name_hi?: string | null;
  scope: ScopeLevel | null;
  district_id?: string | null;
  district_name_en: string | null;
  center_id?: string | null;
  center_code: string | null;
  center_name_en?: string | null;
}

/** A row of GET /users. Mobile and email arrive masked; the screen never sees them in full. */
export interface UserRow {
  id: string;
  user_code: string;
  full_name: string;
  mobile_masked: string | null;
  email_masked: string | null;
  is_active: boolean;
  is_locked: boolean;
  mfa_enabled: boolean;
  must_change_password?: boolean;
  last_login_at: string | null;
  assignments: UserAssignment[];
}

export interface UserCreateResult {
  user: UserRow;
  temporary_password: string;
}

export interface TemporaryPasswordResult {
  temporary_password: string;
}

export interface Role {
  id: string;
  code: string;
  name_en: string;
  name_hi: string | null;
  scope_level: ScopeLevel;
  mfa_required: boolean;
  permission_count: number;
  permissions_customized: boolean;
  assignable?: boolean;
}

export interface RoleDetail extends Role {
  permissions: string[];
}

export interface PermissionDef {
  code: string;
  section: string;
  resource: string;
  action: string;
  label_en: string;
  label_hi: string | null;
  allowed_scopes: ScopeLevel[];
  delegable: boolean;
  sensitive: boolean;
}

export interface AuditEvent {
  id: string;
  chain: string;
  seq: number | string;
  action: string;
  outcome: "SUCCESS" | "FAILURE";
  actor_user_id: string | null;
  actor_role: string | null;
  entity_type: string | null;
  entity_id: string | null;
  district_id: string | null;
  center_id: string | null;
  request_id: string | null;
  ip: string | null;
  data: unknown;
  created_at: string;
}

export interface AuditChainResult {
  chain: string;
  ok: boolean;
  checked: number;
  broken_at_seq: number | null;
}

export type ImportKind = "centers" | "soch" | "payments";
export type ImportStatus = "VALIDATED" | "REJECTED" | "COMMITTED" | "CANCELLED";
export type ImportRowStatus = "VALID" | "ERROR" | "DUPLICATE";

/** data-service `batch` (API_DATA §2). */
export interface ImportBatch {
  id: string;
  kind: ImportKind;
  status: ImportStatus;
  file_name: string;
  file_type: "xlsx" | "csv";
  row_count: number;
  valid_count: number;
  error_count: number;
  duplicate_count: number;
  create_count: number;
  update_count: number;
  unchanged_count: number;
  uploaded_by: string;
  uploaded_at: string;
  committed_by: string | null;
  committed_at: string | null;
  header_errors: unknown[];
}

export interface ImportRowError {
  field: string;
  rule?: string;
  message: string;
}

/** data-service `row`. */
export interface ImportRow {
  row_number: number;
  status: ImportRowStatus;
  action?: "CREATE" | "UPDATE" | "UNCHANGED" | null;
  values: Record<string, unknown>;
  errors: ImportRowError[];
}

/** GET /auth/public/centers: the login Center picker. */
export interface LoginCenter {
  code: string;
  name_en: string;
  name_hi: string | null;
  district_en: string | null;
  district_hi: string | null;
}
