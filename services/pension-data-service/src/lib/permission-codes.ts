/**
 * Every permission code and role code in the system, as constants (rule R-RBAC-1).
 *
 * Code ALWAYS refers to a permission through `P.<NAME>`, never a string literal, so a typo is a compile
 * error instead of a silent 403. This file is byte-identical in the three services and in
 * web/pension-web/src/lib/shared/ (scripts/check-lib-sync.sh enforces it).
 *
 * Format: `pension:<section>.<resource>.<action>`, all lowercase, exactly three dot-separated parts.
 *
 * Adding a permission (docs/HOWTO.md "Add a permission"):
 *   1. add it here,
 *   2. add its label, scopes and delegable flag in pension-auth-service/src/domain/permissions.ts,
 *   3. add it to the role templates that should hold it (same file),
 *   4. add a row to docs/RBAC_PERMISSION_MATRIX.md,
 *   5. run scripts/sync-lib.sh, then `scripts/dev.sh seed` (rbac sync) locally.
 */

export type ScopeLevel = 'STATE' | 'DISTRICT' | 'CENTER';
export const SCOPE_LEVELS: readonly ScopeLevel[] = ['STATE', 'DISTRICT', 'CENTER'];

export const ROLE = {
  SUPER_ADMIN: 'super_admin',
  STATE_ADMIN: 'state_admin',
  STATE_VERIFIER: 'state_verifier',
  STATE_APPROVER: 'state_approver',
  AUDITOR: 'auditor',
  DISTRICT_OFFICER: 'district_officer',
  CENTER_INCHARGE: 'center_incharge',
  CENTER_WORKER: 'center_worker',
} as const;
export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

export const P = {
  // ---- dashboard
  DASHBOARD_STATE_VIEW: 'pension:dashboard.state.view',
  DASHBOARD_DISTRICT_VIEW: 'pension:dashboard.district.view',
  DASHBOARD_CENTER_VIEW: 'pension:dashboard.center.view',

  // ---- beneficiaries (SOCH-derived master records)
  BENEFICIARY_RECORD_VIEW: 'pension:beneficiary.record.view',
  BENEFICIARY_PII_UNMASK: 'pension:beneficiary.pii.unmask',

  // ---- pension applications
  APPLICATION_RECORD_VIEW: 'pension:application.record.view',
  APPLICATION_HISTORY_VIEW: 'pension:application.history.view',
  APPLICATION_DRAFT_CREATE: 'pension:application.draft.create',
  APPLICATION_DRAFT_EDIT: 'pension:application.draft.edit',
  APPLICATION_WORKFLOW_SUBMIT: 'pension:application.workflow.submit',
  APPLICATION_WORKFLOW_SIGNOFF: 'pension:application.workflow.signoff',
  APPLICATION_WORKFLOW_RETURN_TO_WORKER: 'pension:application.workflow.return_to_worker',
  APPLICATION_WORKFLOW_PICK: 'pension:application.workflow.pick',
  APPLICATION_WORKFLOW_RETURN: 'pension:application.workflow.return',
  APPLICATION_WORKFLOW_RECOMMEND: 'pension:application.workflow.recommend',
  APPLICATION_WORKFLOW_APPROVE: 'pension:application.workflow.approve',
  APPLICATION_WORKFLOW_REJECT: 'pension:application.workflow.reject',
  CONSENT_DOCUMENT_UPLOAD: 'pension:consent.document.upload',
  CONSENT_DOCUMENT_VIEW: 'pension:consent.document.view',

  // ---- verification and approval queues
  VERIFICATION_QUEUE_VIEW: 'pension:verification.queue.view',
  APPROVAL_QUEUE_VIEW: 'pension:approval.queue.view',

  // ---- PPO
  PPO_RECORD_VIEW: 'pension:ppo.record.view',
  PPO_RECORD_GENERATE: 'pension:ppo.record.generate',
  PPO_RECORD_MANUAL_ASSIGN: 'pension:ppo.record.manual_assign',
  PPO_RECORD_CORRECT: 'pension:ppo.record.correct',
  PPO_DOCUMENT_PRINT: 'pension:ppo.document.print',

  // ---- payments
  PAYMENT_RECORD_VIEW: 'pension:payment.record.view',
  PAYMENT_RECORD_CREATE: 'pension:payment.record.create',
  PAYMENT_RECORD_EDIT: 'pension:payment.record.edit',
  PAYMENT_FILE_IMPORT: 'pension:payment.file.import',

  // ---- imports (data-service)
  IMPORT_SOCH_UPLOAD: 'pension:import.soch.upload',
  IMPORT_SOCH_COMMIT: 'pension:import.soch.commit',
  IMPORT_CENTER_UPLOAD: 'pension:import.center.upload',
  IMPORT_CENTER_COMMIT: 'pension:import.center.commit',
  IMPORT_BATCH_VIEW: 'pension:import.batch.view',
  IMPORT_REVIEW_RESOLVE: 'pension:import.review.resolve',

  // ---- reports and exports
  REPORT_RECORD_VIEW: 'pension:report.record.view',
  REPORT_FILE_EXPORT: 'pension:report.file.export',
  REPORT_FILE_EXPORT_SENSITIVE: 'pension:report.file.export_sensitive',

  // ---- masters and settings
  MASTER_DISTRICT_VIEW: 'pension:master.district.view',
  MASTER_DISTRICT_EDIT: 'pension:master.district.edit',
  MASTER_CENTER_VIEW: 'pension:master.center.view',
  MASTER_CENTER_CREATE: 'pension:master.center.create',
  MASTER_CENTER_EDIT: 'pension:master.center.edit',
  MASTER_SETTINGS_VIEW: 'pension:master.settings.view',
  MASTER_SETTINGS_EDIT: 'pension:master.settings.edit',

  // ---- users and roles
  USER_ACCOUNT_VIEW: 'pension:user.account.view',
  USER_ACCOUNT_CREATE: 'pension:user.account.create',
  USER_ACCOUNT_EDIT: 'pension:user.account.edit',
  USER_ACCOUNT_ACTIVATE: 'pension:user.account.activate',
  USER_ACCOUNT_PASSWORD_RESET: 'pension:user.account.password_reset',
  USER_ASSIGNMENT_MANAGE: 'pension:user.assignment.manage',
  ROLE_CATALOGUE_VIEW: 'pension:role.catalogue.view',
  ROLE_PERMISSIONS_EDIT: 'pension:role.permissions.edit',

  // ---- audit
  AUDIT_LOG_VIEW: 'pension:audit.log.view',
  AUDIT_CHAIN_VERIFY: 'pension:audit.chain.verify',

  // ---- system
  SYSTEM_CONSOLE_ACCESS: 'pension:system.console.access',
} as const;

export type PermissionCode = (typeof P)[keyof typeof P];
export const ALL_PERMISSION_CODES: readonly PermissionCode[] = Object.values(P);

const CODE_SHAPE = /^pension:[a-z_]+\.[a-z_]+\.[a-z_]+$/;
export const isPermissionCode = (v: string): v is PermissionCode => CODE_SHAPE.test(v) && (ALL_PERMISSION_CODES as readonly string[]).includes(v);
