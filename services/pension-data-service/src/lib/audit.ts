import type { DataSource, EntityManager } from 'typeorm';
import { currentServiceName } from './internal-call';
import { redact } from './redact';
import { getRequestContext } from './request-context';

/**
 * Append-only, hash-chained audit log (rule R-AUDIT-1, docs/SECURITY.md S-AUD-1..4).
 *
 * Rows live in pension_audit.audit_logs, owned by auth-service. NO service writes the table directly:
 * every service calls the SECURITY DEFINER function pension_audit.append_event(chain, payload), which
 * takes a per-chain advisory lock, reads the chain's last hash, and stores
 *   event_hash = sha256(prev_hash || '|' || payload::text)
 * Core and data hold EXECUTE on that function and nothing else in the schema, so they cannot read,
 * change or delete audit rows. UPDATE and DELETE are blocked by a trigger even for the owner.
 *
 * WHAT TO PUT IN `data`: ids, codes, statuses, counts and FIELD NAMES. Never a value that is personal
 * data. `data` is passed through redact() as a safety net, but do not rely on it.
 *
 * Call it INSIDE the same transaction as the change it records (pass the transaction's manager), so a
 * rolled-back change leaves no audit row and a committed one always has one.
 */

/** Every audit action in the system. Add new ones here; docs/AUDIT_EVENTS.md lists them. */
export const AUDIT = {
  // auth-service
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  LOGIN_LOCKED: 'auth.login.locked',
  MFA_ENROLLED: 'auth.mfa.enrolled',
  MFA_FAILURE: 'auth.mfa.failure',
  LOGOUT: 'auth.session.logout',
  SESSION_SWITCH: 'auth.session.switch',
  SESSION_REPLAY: 'auth.session.replay_detected',
  PASSWORD_CHANGED: 'auth.password.changed',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset_requested',
  PASSWORD_RESET_DONE: 'auth.password.reset_done',
  PASSWORD_RESET_BY_ADMIN: 'auth.password.reset_by_admin',
  USER_CREATED: 'auth.user.created',
  USER_UPDATED: 'auth.user.updated',
  USER_ACTIVATED: 'auth.user.activated',
  USER_DEACTIVATED: 'auth.user.deactivated',
  USER_UNLOCKED: 'auth.user.unlocked',
  ASSIGNMENT_ADDED: 'auth.assignment.added',
  ASSIGNMENT_REMOVED: 'auth.assignment.removed',
  ROLE_PERMISSIONS_CHANGED: 'auth.role.permissions_changed',
  DISTRICT_UPDATED: 'auth.district.updated',
  CENTER_CREATED: 'auth.center.created',
  CENTER_UPDATED: 'auth.center.updated',
  CENTER_ACTIVATED: 'auth.center.activated',
  CENTER_DEACTIVATED: 'auth.center.deactivated',
  CENTERS_IMPORTED: 'auth.center.imported',
  AUDIT_CHAIN_VERIFIED: 'auth.audit.chain_verified',
  // core-service (Phase 1+)
  BENEFICIARY_VIEWED: 'core.beneficiary.viewed',
  BENEFICIARY_PII_UNMASKED: 'core.beneficiary.pii_unmasked',
  APPLICATION_CREATED: 'core.application.created',
  APPLICATION_UPDATED: 'core.application.updated',
  APPLICATION_TRANSITION: 'core.application.transition',
  PPO_GENERATED: 'core.ppo.generated',
  PPO_CORRECTED: 'core.ppo.corrected',
  PPO_PRINTED: 'core.ppo.printed',
  PAYMENT_RECORDED: 'core.payment.recorded',
  SETTINGS_UPDATED: 'core.settings.updated',
  DOCUMENT_UPLOADED: 'core.document.uploaded',
  DOCUMENT_VIEWED: 'core.document.viewed',
  // data-service
  IMPORT_UPLOADED: 'data.import.uploaded',
  IMPORT_COMMITTED: 'data.import.committed',
  IMPORT_CANCELLED: 'data.import.cancelled',
  IMPORT_REJECTED_FILE: 'data.import.file_rejected',
  EXPORT_CREATED: 'data.export.created',
  EXPORT_DOWNLOADED: 'data.export.downloaded',
} as const;
export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];

export interface AuditEvent {
  action: AuditAction;
  outcome?: 'SUCCESS' | 'FAILURE';
  entityType?: string;
  entityId?: string | null;
  /** Defaults to the request's user. Pass null for events with no known actor (failed login). */
  actorUserId?: string | null;
  districtId?: string | null;
  centerId?: string | null;
  data?: Record<string, unknown>;
}

export const writeAudit = async (db: DataSource | EntityManager, ev: AuditEvent): Promise<void> => {
  const ctx = getRequestContext();
  const payload = {
    action: ev.action,
    outcome: ev.outcome ?? 'SUCCESS',
    service: currentServiceName(),
    entity_type: ev.entityType ?? null,
    entity_id: ev.entityId ?? null,
    actor_user_id: ev.actorUserId === undefined ? (ctx?.user_id ?? null) : ev.actorUserId,
    actor_role: ctx?.active_role ?? null,
    session_id: ctx?.session_id ?? null,
    district_id: ev.districtId ?? null,
    center_id: ev.centerId ?? ctx?.active_facility_id ?? null,
    request_id: ctx?.request_id ?? null,
    ip: ctx?.ip ?? null,
    data: ev.data ? redact(ev.data) : null,
    at: new Date().toISOString(),
  };
  await db.query('SELECT pension_audit.append_event($1, $2::jsonb)', [currentServiceName(), JSON.stringify(payload)]);
};
