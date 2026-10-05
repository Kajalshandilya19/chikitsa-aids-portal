import { P, ROLE, type PermissionCode, type RoleCode, type ScopeLevel } from '../lib/permission-codes';

/**
 * Permission catalogue (labels, allowed scopes, delegable, sensitive) and the 8 role templates.
 * docs/RBAC_PERMISSION_MATRIX.md is the human-readable copy of THIS file; the two must agree
 * (tests/unit/permissions.test.ts checks the catalogue covers every P.* exactly once).
 *
 * Code is the source of truth for the CATALOGUE: `npm run seed` (rbac sync) upserts it into
 * pension_auth.permissions and prunes codes removed here. Role templates are reset to the defaults
 * below on every sync unless a super admin has edited the role (`permissions_customized`).
 */

export interface PermissionDef {
  code: PermissionCode;
  en: string;
  hi: string;
  /** Role scope levels that may hold it. A CENTER role can never hold a STATE-only permission. */
  scopes: readonly ScopeLevel[];
  /** false: only a super admin may put it in a role or assign a role holding it. */
  delegable: boolean;
  /** Unmasked personal data or full exports. */
  sensitive: boolean;
}

const ALL: readonly ScopeLevel[] = ['STATE', 'DISTRICT', 'CENTER'];
const STATE: readonly ScopeLevel[] = ['STATE'];
const STATE_DISTRICT: readonly ScopeLevel[] = ['STATE', 'DISTRICT'];
const CENTER: readonly ScopeLevel[] = ['CENTER'];

const def = (code: PermissionCode, en: string, hi: string, scopes: readonly ScopeLevel[], opts: { delegable?: boolean; sensitive?: boolean } = {}): PermissionDef => ({
  code,
  en,
  hi,
  scopes,
  delegable: opts.delegable ?? true,
  sensitive: opts.sensitive ?? false,
});

export const PERMISSIONS: readonly PermissionDef[] = [
  // dashboard
  def(P.DASHBOARD_STATE_VIEW, 'State dashboard', 'राज्य डैशबोर्ड', STATE),
  def(P.DASHBOARD_DISTRICT_VIEW, 'District dashboard', 'जिला डैशबोर्ड', STATE_DISTRICT),
  def(P.DASHBOARD_CENTER_VIEW, 'Center dashboard', 'केंद्र डैशबोर्ड', ALL),
  // beneficiaries
  def(P.BENEFICIARY_RECORD_VIEW, 'View beneficiaries (masked identifiers)', 'लाभार्थी देखें (छिपे पहचान नंबर)', ALL),
  def(P.BENEFICIARY_PII_UNMASK, 'Reveal full Aadhaar, Jan Aadhaar, bank account and mobile', 'पूर्ण आधार, जन आधार, बैंक खाता व मोबाइल देखें', STATE, { sensitive: true }),
  // applications
  def(P.APPLICATION_RECORD_VIEW, 'View pension applications', 'पेंशन आवेदन देखें', ALL),
  def(P.APPLICATION_HISTORY_VIEW, 'View application status history', 'आवेदन स्थिति इतिहास देखें', ALL),
  def(P.APPLICATION_DRAFT_CREATE, 'Start a pension application', 'पेंशन आवेदन प्रारंभ करें', CENTER),
  def(P.APPLICATION_DRAFT_EDIT, 'Edit a draft or returned application', 'मसौदा या लौटाया गया आवेदन संपादित करें', CENTER),
  def(P.APPLICATION_WORKFLOW_SUBMIT, 'Submit an application for sign-off', 'आवेदन हस्ताक्षर हेतु जमा करें', CENTER),
  def(P.APPLICATION_WORKFLOW_SIGNOFF, 'Sign off an application (Center in-charge)', 'आवेदन पर हस्ताक्षर करें (केंद्र प्रभारी)', CENTER),
  def(P.APPLICATION_WORKFLOW_RETURN_TO_WORKER, 'Return an application to the worker before sign-off', 'हस्ताक्षर से पहले आवेदन कार्यकर्ता को लौटाएँ', CENTER),
  def(P.APPLICATION_WORKFLOW_PICK, 'Take an application for verification', 'आवेदन सत्यापन हेतु लें', STATE),
  def(P.APPLICATION_WORKFLOW_RETURN, 'Return an application for correction', 'आवेदन सुधार हेतु लौटाएँ', STATE),
  def(P.APPLICATION_WORKFLOW_RECOMMEND, 'Recommend approval or rejection', 'स्वीकृति या अस्वीकृति की अनुशंसा करें', STATE),
  def(P.APPLICATION_WORKFLOW_APPROVE, 'Approve an application', 'आवेदन स्वीकृत करें', STATE),
  def(P.APPLICATION_WORKFLOW_REJECT, 'Reject an application', 'आवेदन अस्वीकृत करें', STATE),
  def(P.CONSENT_DOCUMENT_UPLOAD, 'Upload a consent document', 'सहमति दस्तावेज़ अपलोड करें', CENTER),
  def(P.CONSENT_DOCUMENT_VIEW, 'Open consent documents', 'सहमति दस्तावेज़ देखें', ALL, { sensitive: true }),
  // queues
  def(P.VERIFICATION_QUEUE_VIEW, 'Verification queue', 'सत्यापन कतार', STATE),
  def(P.APPROVAL_QUEUE_VIEW, 'Approval queue', 'स्वीकृति कतार', STATE),
  // PPO
  def(P.PPO_RECORD_VIEW, 'View PPO records', 'पीपीओ रिकॉर्ड देखें', ALL),
  def(P.PPO_RECORD_GENERATE, 'Generate a PPO number', 'पीपीओ संख्या बनाएँ', STATE),
  def(P.PPO_RECORD_MANUAL_ASSIGN, 'Enter a PPO number manually', 'पीपीओ संख्या स्वयं दर्ज करें', STATE, { delegable: false }),
  def(P.PPO_RECORD_CORRECT, 'Correct a generated PPO', 'बनाए गए पीपीओ में सुधार करें', STATE, { delegable: false }),
  def(P.PPO_DOCUMENT_PRINT, 'Print or download the PPO sheet', 'पीपीओ पत्र प्रिंट या डाउनलोड करें', ALL),
  // payments
  def(P.PAYMENT_RECORD_VIEW, 'View payment history', 'भुगतान इतिहास देखें', ALL),
  def(P.PAYMENT_RECORD_CREATE, 'Record a payment', 'भुगतान दर्ज करें', STATE),
  def(P.PAYMENT_RECORD_EDIT, 'Edit a payment record', 'भुगतान रिकॉर्ड संपादित करें', STATE),
  def(P.PAYMENT_FILE_IMPORT, 'Import payments from Excel or CSV', 'एक्सेल या CSV से भुगतान आयात करें', STATE),
  // imports
  def(P.IMPORT_SOCH_UPLOAD, 'Upload a SOCH Excel file', 'SOCH एक्सेल फ़ाइल अपलोड करें', STATE),
  def(P.IMPORT_SOCH_COMMIT, 'Confirm a SOCH import', 'SOCH आयात की पुष्टि करें', STATE),
  def(P.IMPORT_CENTER_UPLOAD, 'Upload a Center list', 'केंद्र सूची अपलोड करें', STATE),
  def(P.IMPORT_CENTER_COMMIT, 'Confirm a Center import', 'केंद्र आयात की पुष्टि करें', STATE),
  def(P.IMPORT_BATCH_VIEW, 'View import history', 'आयात इतिहास देखें', STATE),
  def(P.IMPORT_REVIEW_RESOLVE, 'Resolve import conflicts (merged UIDs)', 'आयात विरोधाभास सुलझाएँ (मर्ज UID)', STATE),
  // reports
  def(P.REPORT_RECORD_VIEW, 'View reports', 'रिपोर्ट देखें', ALL),
  def(P.REPORT_FILE_EXPORT, 'Export reports (masked identifiers)', 'रिपोर्ट निर्यात करें (छिपे पहचान नंबर)', STATE_DISTRICT),
  def(P.REPORT_FILE_EXPORT_SENSITIVE, 'Export reports with full identifiers', 'पूर्ण पहचान नंबर सहित रिपोर्ट निर्यात करें', STATE, { delegable: false, sensitive: true }),
  // masters
  def(P.MASTER_DISTRICT_VIEW, 'View districts', 'जिले देखें', ALL),
  def(P.MASTER_DISTRICT_EDIT, 'Edit districts', 'जिले संपादित करें', STATE),
  def(P.MASTER_CENTER_VIEW, 'View Centers', 'केंद्र देखें', ALL),
  def(P.MASTER_CENTER_CREATE, 'Add a Center', 'केंद्र जोड़ें', STATE),
  def(P.MASTER_CENTER_EDIT, 'Edit, activate or deactivate a Center', 'केंद्र संपादित, सक्रिय या निष्क्रिय करें', STATE),
  def(P.MASTER_SETTINGS_VIEW, 'View portal settings (PPO format, pension rules)', 'पोर्टल सेटिंग देखें (पीपीओ प्रारूप, पेंशन नियम)', STATE),
  def(P.MASTER_SETTINGS_EDIT, 'Edit portal settings', 'पोर्टल सेटिंग संपादित करें', STATE, { delegable: false }),
  // users and roles
  def(P.USER_ACCOUNT_VIEW, 'View users', 'उपयोगकर्ता देखें', STATE_DISTRICT),
  def(P.USER_ACCOUNT_CREATE, 'Create users', 'उपयोगकर्ता बनाएँ', STATE),
  def(P.USER_ACCOUNT_EDIT, 'Edit users', 'उपयोगकर्ता संपादित करें', STATE),
  def(P.USER_ACCOUNT_ACTIVATE, 'Activate, deactivate or unlock users', 'उपयोगकर्ता सक्रिय, निष्क्रिय या अनलॉक करें', STATE),
  def(P.USER_ACCOUNT_PASSWORD_RESET, 'Set a temporary password for a user', 'उपयोगकर्ता का अस्थायी पासवर्ड सेट करें', STATE),
  def(P.USER_ASSIGNMENT_MANAGE, 'Assign and remove roles', 'भूमिकाएँ प्रदान करें या हटाएँ', STATE),
  def(P.ROLE_CATALOGUE_VIEW, 'View roles and their permissions', 'भूमिकाएँ व अनुमतियाँ देखें', STATE),
  def(P.ROLE_PERMISSIONS_EDIT, 'Edit the permissions of a role', 'भूमिका की अनुमतियाँ संपादित करें', STATE, { delegable: false }),
  // audit
  def(P.AUDIT_LOG_VIEW, 'View the audit log', 'ऑडिट लॉग देखें', STATE),
  def(P.AUDIT_CHAIN_VERIFY, 'Verify the audit log integrity', 'ऑडिट लॉग की अखंडता जाँचें', STATE),
  // system
  def(P.SYSTEM_CONSOLE_ACCESS, 'Super admin console', 'सुपर एडमिन कंसोल', STATE, { delegable: false }),
];

export const PERMISSION_BY_CODE: ReadonlyMap<string, PermissionDef> = new Map(PERMISSIONS.map((p) => [p.code, p]));

const parts = (code: string): [string, string, string] => {
  const [section = '', resource = '', action = ''] = code.replace(/^pension:/, '').split('.');
  return [section, resource, action];
};
export const sectionOf = (code: string) => parts(code)[0];
export const resourceOf = (code: string) => parts(code)[1];
export const actionOf = (code: string) => parts(code)[2];

// ---------------------------------------------------------------- role templates

export interface RoleTemplate {
  code: RoleCode;
  en: string;
  hi: string;
  scope: ScopeLevel;
  mfaRequired: boolean;
  permissions: readonly PermissionCode[];
}

const VIEW_MASTERS = [P.MASTER_DISTRICT_VIEW, P.MASTER_CENTER_VIEW] as const;
const READ_CASES = [P.BENEFICIARY_RECORD_VIEW, P.APPLICATION_RECORD_VIEW, P.APPLICATION_HISTORY_VIEW, P.PPO_RECORD_VIEW, P.PAYMENT_RECORD_VIEW] as const;

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  {
    code: ROLE.SUPER_ADMIN,
    en: 'Super Admin',
    hi: 'सुपर एडमिन',
    scope: 'STATE',
    mfaRequired: true,
    // Everything. Technical role: manages State Admins, role permissions and settings.
    permissions: PERMISSIONS.filter((p) => p.scopes.includes('STATE')).map((p) => p.code),
  },
  {
    code: ROLE.STATE_ADMIN,
    en: 'State Admin (RSACS)',
    hi: 'राज्य प्रशासक (RSACS)',
    scope: 'STATE',
    mfaRequired: true,
    permissions: [
      P.DASHBOARD_STATE_VIEW,
      P.DASHBOARD_DISTRICT_VIEW,
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.PAYMENT_RECORD_CREATE,
      P.PAYMENT_RECORD_EDIT,
      P.PAYMENT_FILE_IMPORT,
      P.IMPORT_SOCH_UPLOAD,
      P.IMPORT_SOCH_COMMIT,
      P.IMPORT_CENTER_UPLOAD,
      P.IMPORT_CENTER_COMMIT,
      P.IMPORT_BATCH_VIEW,
      P.IMPORT_REVIEW_RESOLVE,
      P.REPORT_RECORD_VIEW,
      P.REPORT_FILE_EXPORT,
      ...VIEW_MASTERS,
      P.MASTER_DISTRICT_EDIT,
      P.MASTER_CENTER_CREATE,
      P.MASTER_CENTER_EDIT,
      P.MASTER_SETTINGS_VIEW,
      P.USER_ACCOUNT_VIEW,
      P.USER_ACCOUNT_CREATE,
      P.USER_ACCOUNT_EDIT,
      P.USER_ACCOUNT_ACTIVATE,
      P.USER_ACCOUNT_PASSWORD_RESET,
      P.USER_ASSIGNMENT_MANAGE,
      P.ROLE_CATALOGUE_VIEW,
      P.AUDIT_LOG_VIEW,
    ],
  },
  {
    code: ROLE.STATE_VERIFIER,
    en: 'State Verifier',
    hi: 'राज्य सत्यापनकर्ता',
    scope: 'STATE',
    mfaRequired: true,
    permissions: [
      P.DASHBOARD_STATE_VIEW,
      P.DASHBOARD_DISTRICT_VIEW,
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.BENEFICIARY_PII_UNMASK,
      P.CONSENT_DOCUMENT_VIEW,
      P.VERIFICATION_QUEUE_VIEW,
      P.APPLICATION_WORKFLOW_PICK,
      P.APPLICATION_WORKFLOW_RETURN,
      P.APPLICATION_WORKFLOW_RECOMMEND,
      P.PPO_DOCUMENT_PRINT,
      P.REPORT_RECORD_VIEW,
      P.REPORT_FILE_EXPORT,
      ...VIEW_MASTERS,
    ],
  },
  {
    code: ROLE.STATE_APPROVER,
    en: 'State Approver',
    hi: 'राज्य स्वीकृतिकर्ता',
    scope: 'STATE',
    mfaRequired: true,
    permissions: [
      P.DASHBOARD_STATE_VIEW,
      P.DASHBOARD_DISTRICT_VIEW,
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.BENEFICIARY_PII_UNMASK,
      P.CONSENT_DOCUMENT_VIEW,
      P.APPROVAL_QUEUE_VIEW,
      P.APPLICATION_WORKFLOW_RETURN,
      P.APPLICATION_WORKFLOW_APPROVE,
      P.APPLICATION_WORKFLOW_REJECT,
      P.PPO_RECORD_GENERATE,
      P.PPO_DOCUMENT_PRINT,
      P.PAYMENT_RECORD_CREATE,
      P.PAYMENT_RECORD_EDIT,
      P.PAYMENT_FILE_IMPORT,
      P.REPORT_RECORD_VIEW,
      P.REPORT_FILE_EXPORT,
      P.MASTER_SETTINGS_VIEW,
      ...VIEW_MASTERS,
    ],
  },
  {
    code: ROLE.AUDITOR,
    en: 'Auditor (read only)',
    hi: 'लेखा परीक्षक (केवल पढ़ें)',
    scope: 'STATE',
    mfaRequired: true,
    permissions: [
      P.DASHBOARD_STATE_VIEW,
      P.DASHBOARD_DISTRICT_VIEW,
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.IMPORT_BATCH_VIEW,
      P.REPORT_RECORD_VIEW,
      P.REPORT_FILE_EXPORT,
      ...VIEW_MASTERS,
      P.AUDIT_LOG_VIEW,
      P.AUDIT_CHAIN_VERIFY,
    ],
  },
  {
    code: ROLE.DISTRICT_OFFICER,
    en: 'District Officer (DAPCU)',
    hi: 'जिला अधिकारी (DAPCU)',
    scope: 'DISTRICT',
    mfaRequired: true,
    permissions: [P.DASHBOARD_DISTRICT_VIEW, P.DASHBOARD_CENTER_VIEW, ...READ_CASES, P.REPORT_RECORD_VIEW, P.REPORT_FILE_EXPORT, ...VIEW_MASTERS, P.USER_ACCOUNT_VIEW],
  },
  {
    code: ROLE.CENTER_INCHARGE,
    en: 'Center In-charge (Medical Officer)',
    hi: 'केंद्र प्रभारी (चिकित्सा अधिकारी)',
    scope: 'CENTER',
    mfaRequired: false,
    permissions: [
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.CONSENT_DOCUMENT_VIEW,
      P.APPLICATION_WORKFLOW_SIGNOFF,
      P.APPLICATION_WORKFLOW_RETURN_TO_WORKER,
      P.PPO_DOCUMENT_PRINT,
      P.REPORT_RECORD_VIEW,
      ...VIEW_MASTERS,
    ],
  },
  {
    code: ROLE.CENTER_WORKER,
    en: 'Center Worker',
    hi: 'केंद्र कार्यकर्ता',
    scope: 'CENTER',
    mfaRequired: false,
    permissions: [
      P.DASHBOARD_CENTER_VIEW,
      ...READ_CASES,
      P.APPLICATION_DRAFT_CREATE,
      P.APPLICATION_DRAFT_EDIT,
      P.APPLICATION_WORKFLOW_SUBMIT,
      P.CONSENT_DOCUMENT_UPLOAD,
      P.CONSENT_DOCUMENT_VIEW,
      P.PPO_DOCUMENT_PRINT,
      ...VIEW_MASTERS,
    ],
  },
];

export const TEMPLATE_BY_CODE: ReadonlyMap<string, RoleTemplate> = new Map(ROLE_TEMPLATES.map((t) => [t.code, t]));

// ---------------------------------------------------------------- delegation rules

/**
 * Which roles an actor may hand out (BR-U4 in docs/BUSINESS_RULES.md):
 *   - super_admin: any role.
 *   - anyone else holding P.USER_ASSIGNMENT_MANAGE: only DISTRICT and CENTER scope roles (the plan: the
 *     State Admin manages users "below State"), and only roles made entirely of delegable permissions.
 * Why not "only permissions the actor holds": a State Admin must create Center Workers, whose
 * application permissions are CENTER-only and can never be held by a State role. Escalation is still
 * impossible because only a Super Admin can change what a role contains (ROLE_PERMISSIONS_EDIT is
 * non-delegable), and STATE roles (verifier, approver, auditor, admin) are Super Admin only.
 */
export const canAssignRole = (
  actor: { roleCode: string; permissions: readonly string[] },
  target: { code: string; scopeLevel: ScopeLevel; permissions: readonly string[] },
): boolean => {
  if (actor.roleCode === ROLE.SUPER_ADMIN) return true;
  if (!actor.permissions.includes(P.USER_ASSIGNMENT_MANAGE)) return false;
  if (target.scopeLevel === 'STATE') return false;
  return target.permissions.every((c) => PERMISSION_BY_CODE.get(c)?.delegable ?? false);
};

/** A role's permission set is valid when every code exists and is allowed at the role's scope. */
export const invalidPermissionsForScope = (scope: ScopeLevel, codes: readonly string[]): string[] =>
  codes.filter((c) => !PERMISSION_BY_CODE.get(c)?.scopes.includes(scope));
