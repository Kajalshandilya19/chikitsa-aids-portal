import { canAssignRole, invalidPermissionsForScope, PERMISSIONS, ROLE_TEMPLATES, TEMPLATE_BY_CODE } from '../../src/domain/permissions';
import { ALL_PERMISSION_CODES, isPermissionCode, P, ROLE } from '../../src/lib/permission-codes';

/** UT-RBAC-*: the catalogue and templates in src/domain/permissions.ts (docs/RBAC_PERMISSION_MATRIX.md). */
describe('permission catalogue', () => {
  test('UT-RBAC-001 every P.* code is in the catalogue exactly once, and nothing else is', () => {
    const codes = PERMISSIONS.map((p) => p.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...ALL_PERMISSION_CODES].sort());
    for (const c of codes) expect(isPermissionCode(c)).toBe(true);
  });

  test('UT-RBAC-002 every template only holds permissions allowed at its scope', () => {
    for (const t of ROLE_TEMPLATES) expect({ role: t.code, bad: invalidPermissionsForScope(t.scope, t.permissions) }).toEqual({ role: t.code, bad: [] });
  });

  test('UT-RBAC-003 there are exactly the 8 planned roles, MFA on every STATE and DISTRICT role', () => {
    expect(ROLE_TEMPLATES.map((t) => t.code).sort()).toEqual(Object.values(ROLE).sort());
    for (const t of ROLE_TEMPLATES) expect(t.mfaRequired).toBe(t.scope !== 'CENTER');
  });

  test('UT-RBAC-004 maker-checker: no template can both recommend and approve', () => {
    for (const t of ROLE_TEMPLATES.filter((x) => x.code !== ROLE.SUPER_ADMIN)) {
      const both = t.permissions.includes(P.APPLICATION_WORKFLOW_RECOMMEND) && t.permissions.includes(P.APPLICATION_WORKFLOW_APPROVE);
      expect({ role: t.code, both }).toEqual({ role: t.code, both: false });
    }
  });

  test('UT-RBAC-005 only State Verifier and Approver can unmask PII by default (plus Super Admin)', () => {
    const holders = ROLE_TEMPLATES.filter((t) => t.permissions.includes(P.BENEFICIARY_PII_UNMASK)).map((t) => t.code).sort();
    expect(holders).toEqual([ROLE.STATE_APPROVER, ROLE.STATE_VERIFIER, ROLE.SUPER_ADMIN].sort());
  });

  test('UT-RBAC-006 workers cannot export (SRD rule 12)', () => {
    const w = TEMPLATE_BY_CODE.get(ROLE.CENTER_WORKER)!;
    expect(w.permissions).not.toContain(P.REPORT_FILE_EXPORT);
    expect(w.permissions).not.toContain(P.REPORT_FILE_EXPORT_SENSITIVE);
  });
});

describe('canAssignRole (BR-U4)', () => {
  const t = (code: string) => {
    const x = TEMPLATE_BY_CODE.get(code)!;
    return { code: x.code, scopeLevel: x.scope, permissions: x.permissions };
  };
  const stateAdmin = { roleCode: ROLE.STATE_ADMIN, permissions: TEMPLATE_BY_CODE.get(ROLE.STATE_ADMIN)!.permissions };

  test('UT-RBAC-007 super admin can assign any role', () => {
    const sa = { roleCode: ROLE.SUPER_ADMIN, permissions: TEMPLATE_BY_CODE.get(ROLE.SUPER_ADMIN)!.permissions };
    for (const r of ROLE_TEMPLATES) expect(canAssignRole(sa, t(r.code))).toBe(true);
  });

  test('UT-RBAC-008 state admin cannot assign any STATE role (verifier, approver, admin, auditor)', () => {
    for (const code of [ROLE.SUPER_ADMIN, ROLE.STATE_ADMIN, ROLE.STATE_VERIFIER, ROLE.STATE_APPROVER, ROLE.AUDITOR]) {
      expect(canAssignRole(stateAdmin, t(code))).toBe(false);
    }
  });

  test('UT-RBAC-009 state admin can assign the DISTRICT and CENTER roles', () => {
    for (const code of [ROLE.CENTER_WORKER, ROLE.CENTER_INCHARGE, ROLE.DISTRICT_OFFICER]) expect(canAssignRole(stateAdmin, t(code))).toBe(true);
  });

  test('UT-RBAC-011 a role containing a non-delegable permission is Super Admin only', () => {
    const tampered = { ...t(ROLE.CENTER_WORKER), permissions: [...t(ROLE.CENTER_WORKER).permissions, P.PPO_RECORD_CORRECT] };
    expect(canAssignRole(stateAdmin, tampered)).toBe(false);
  });

  test('UT-RBAC-010 an actor without USER_ASSIGNMENT_MANAGE can assign nothing', () => {
    const auditor = { roleCode: ROLE.AUDITOR, permissions: TEMPLATE_BY_CODE.get(ROLE.AUDITOR)!.permissions };
    expect(canAssignRole(auditor, t(ROLE.DISTRICT_OFFICER))).toBe(false);
  });
});
