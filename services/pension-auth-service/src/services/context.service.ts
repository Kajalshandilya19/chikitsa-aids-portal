import { config } from '../config';
import type { UserEntity } from '../entities/user.entity';
import type { UserRoleEntity } from '../entities/user-role.entity';
import type { AuthContext } from '../lib/access-token';
import { permissionsForRole } from '../lib/auth-middleware';

/** Turns (user, assignment, session) into the access-token context and the `/auth/me` shape. */

export const mfaNeeded = (a: UserRoleEntity): boolean => config().MFA_ENFORCED && !!a.role?.mfaRequired;

export const buildContext = (user: UserEntity, a: UserRoleEntity, sessionId: string): AuthContext => ({
  userId: user.id,
  sessionId,
  userCode: user.userCode,
  name: user.fullName,
  assignmentId: a.id,
  roleId: a.roleId,
  roleCode: a.role?.code ?? '',
  scope: a.role?.scopeLevel ?? 'CENTER',
  districtId: a.districtId,
  centerId: a.centerId,
  centerCode: a.center?.code ?? null,
  mustChangePassword: user.mustChangePassword,
});

export const assignmentView = (a: UserRoleEntity) => ({
  id: a.id,
  role: a.role ? { id: a.role.id, code: a.role.code, name_en: a.role.nameEn, name_hi: a.role.nameHi, scope: a.role.scopeLevel } : null,
  district: a.district ? { id: a.district.id, code: a.district.code, name_en: a.district.nameEn, name_hi: a.district.nameHi } : null,
  center: a.center ? { id: a.center.id, code: a.center.code, name_en: a.center.nameEn, name_hi: a.center.nameHi } : null,
});

export const meView = async (user: UserEntity, a: UserRoleEntity, assignmentCount: number) => {
  const v = assignmentView(a);
  return {
    id: user.id,
    user_code: user.userCode,
    name: user.fullName,
    role: v.role,
    district: v.district,
    center: v.center,
    permissions: [...(await permissionsForRole(a.roleId))].sort(),
    must_change_password: user.mustChangePassword,
    mfa_enabled: user.mfaEnabled,
    assignment_count: assignmentCount,
  };
};
