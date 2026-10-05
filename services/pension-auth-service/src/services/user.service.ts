import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { CenterEntity } from '../entities/center.entity';
import { DistrictEntity } from '../entities/district.entity';
import { RoleEntity } from '../entities/role.entity';
import { UserRoleEntity } from '../entities/user-role.entity';
import { UserEntity } from '../entities/user.entity';
import type { AuthContext } from '../lib/access-token';
import { AUDIT, writeAudit } from '../lib/audit';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../lib/errors';
import { last4, maskEmail, maskMobile } from '../lib/mask';
import { blindIndex, nameBlindIndexes } from '../lib/pii';
import { ROLE } from '../lib/permission-codes';
import { canAssignRole } from '../domain/permissions';
import type { AssignmentInput, UserCreate, UserListQuery, UserPatch } from '../dtos/user.dto';
import { assignmentRepository } from '../repositories/assignment.repository';
import { userRepository } from '../repositories/user.repository';
import { roleService } from './role.service';
import { generateTemporaryPassword, hashPassword } from './password.service';
import { sessionService } from './session.service';

/**
 * User administration (docs/API_AUTH.md §5, docs/BUSINESS_RULES.md BR-U1..U6 and BR-A1..A4).
 *
 *   BR-U4  an actor assigns only roles canAssignRole() allows (State Admin: DISTRICT/CENTER roles only)
 *   BR-U5  a user holding any STATE assignment is changed only by a Super Admin
 *   BR-U6  nobody deactivates, unlocks or resets their own account here (use the password flows)
 *   BR-A1  STATE role: no district, no center
 *   BR-A2  DISTRICT role: district required, no center
 *   BR-A3  CENTER role: center required; district is taken from the center
 *   BR-A4  the place must be active
 */

const users = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(UserEntity);
const assignments = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(UserRoleEntity);

const listView = (u: UserEntity, as: UserRoleEntity[]) => ({
  id: u.id,
  user_code: u.userCode,
  full_name: u.fullName,
  mobile_masked: maskMobile(u.mobile),
  email_masked: maskEmail(u.email),
  is_active: u.isActive,
  is_locked: !!u.lockedUntil && u.lockedUntil.getTime() > Date.now(),
  mfa_enabled: u.mfaEnabled,
  must_change_password: u.mustChangePassword,
  last_login_at: u.lastLoginAt,
  assignments: as.map((a) => ({
    id: a.id,
    role_id: a.roleId,
    role_code: a.role?.code ?? null,
    role_name_en: a.role?.nameEn ?? null,
    role_name_hi: a.role?.nameHi ?? null,
    scope: a.role?.scopeLevel ?? null,
    district_id: a.districtId,
    district_name_en: a.district?.nameEn ?? null,
    center_id: a.centerId,
    center_code: a.center?.code ?? null,
    center_name_en: a.center?.nameEn ?? null,
  })),
});

/** District callers see only users assigned in their district; State callers see everyone. */
const assertUserVisible = async (auth: AuthContext, userId: string): Promise<UserEntity> => {
  const u = await userRepository.byId(userId);
  if (!u) throw new NotFoundError('user not found');
  if (auth.scope === 'STATE') return u;
  if (auth.scope === 'DISTRICT' && auth.districtId) {
    const as = await assignmentRepository.forUser(u.id);
    if (as.some((a) => a.districtId === auth.districtId)) return u;
  }
  throw new NotFoundError('user not found');
};

/** BR-U5 and BR-U6 for every write on another user. */
const assertCanManage = async (auth: AuthContext, targetId: string, em?: EntityManager): Promise<void> => {
  if (targetId === auth.userId) throw new ForbiddenError('You cannot change your own account here.', { code: 'E_SELF_MANAGE' });
  if (auth.roleCode !== ROLE.SUPER_ADMIN && (await assignmentRepository.hasStateAssignment(targetId, em))) {
    throw new ForbiddenError('Only a Super Admin can change a State-level user.', { code: 'E_PROTECTED_USER' });
  }
};

/** Validates BR-A1..A4 and BR-U4; returns the normalised place. */
const resolvePlace = async (auth: AuthContext, actorPerms: readonly string[], input: AssignmentInput, em: EntityManager) => {
  const role = await em.getRepository(RoleEntity).findOne({ where: { id: input.role_id } });
  if (!role || !role.isActive) throw new BadRequestError('Select an active role.', { code: 'E_ROLE_INVALID' });
  const rolePerms = await roleService.permissionCodes(role.id, em);
  if (!canAssignRole({ roleCode: auth.roleCode, permissions: actorPerms }, { code: role.code, scopeLevel: role.scopeLevel, permissions: rolePerms })) {
    throw new ForbiddenError('You cannot assign this role.', { code: 'E_ROLE_NOT_ASSIGNABLE' });
  }
  if (role.scopeLevel === 'STATE') {
    if (input.district_id || input.center_id) throw new BadRequestError('A State role takes no district or Center.', { code: 'E_ASSIGNMENT_PLACE' });
    return { role, districtId: null, centerId: null };
  }
  if (role.scopeLevel === 'DISTRICT') {
    if (!input.district_id || input.center_id) throw new BadRequestError('A District role needs a district and no Center.', { code: 'E_ASSIGNMENT_PLACE' });
    const d = await em.getRepository(DistrictEntity).findOne({ where: { id: input.district_id } });
    if (!d || !d.isActive) throw new BadRequestError('Select an active district.', { code: 'E_ASSIGNMENT_PLACE' });
    return { role, districtId: d.id, centerId: null };
  }
  if (!input.center_id) throw new BadRequestError('A Center role needs a Center.', { code: 'E_ASSIGNMENT_PLACE' });
  const c = await em.getRepository(CenterEntity).findOne({ where: { id: input.center_id } });
  if (!c || !c.isActive) throw new BadRequestError('Select an active Center.', { code: 'E_ASSIGNMENT_PLACE' });
  if (input.district_id && input.district_id !== c.districtId) throw new BadRequestError('The Center is not in that district.', { code: 'E_ASSIGNMENT_PLACE' });
  return { role, districtId: c.districtId, centerId: c.id };
};

const addAssignment = async (auth: AuthContext, actorPerms: readonly string[], userId: string, input: AssignmentInput, em: EntityManager) => {
  const place = await resolvePlace(auth, actorPerms, input, em);
  const dup = await assignments(em)
    .createQueryBuilder('a')
    .where('a.user_id = :userId AND a.role_id = :roleId AND a.is_active', { userId, roleId: place.role.id })
    .andWhere('a.district_id IS NOT DISTINCT FROM :d AND a.center_id IS NOT DISTINCT FROM :c', { d: place.districtId, c: place.centerId })
    .getCount();
  if (dup) throw new ConflictError('The user already has this role at this place.');
  const a = await assignments(em).save(
    assignments(em).create({ userId, roleId: place.role.id, districtId: place.districtId, centerId: place.centerId, isActive: true, createdBy: auth.userId }),
  );
  await writeAudit(em, {
    action: AUDIT.ASSIGNMENT_ADDED,
    entityType: 'user',
    entityId: userId,
    districtId: place.districtId,
    centerId: place.centerId,
    data: { assignment_id: a.id, role: place.role.code },
  });
  return a;
};

export const userService = {
  async list(auth: AuthContext, q: UserListQuery) {
    const [rows, total] = await userRepository.list({
      q: q.q,
      roleCode: q.role_code,
      districtId: q.district_id,
      centerId: q.center_id,
      isActive: q.is_active,
      scopeDistrictId: auth.scope === 'DISTRICT' ? (auth.districtId ?? '00000000-0000-0000-0000-000000000000') : undefined,
      page: q.page,
      limit: q.limit,
    });
    const out = [];
    for (const u of rows) out.push(listView(u, await assignmentRepository.forUser(u.id)));
    return { rows: out, total };
  },

  async get(auth: AuthContext, id: string) {
    const u = await assertUserVisible(auth, id);
    return listView(u, await assignmentRepository.forUser(u.id));
  },

  async create(auth: AuthContext, actorPerms: readonly string[], input: UserCreate) {
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    const user = await AppDataSource.transaction(async (em) => {
      if (await userRepository.codeExists(input.user_code, em)) throw new ConflictError(`User ID ${input.user_code} is already taken.`);
      const u = await users(em).save(
        users(em).create({
          userCode: input.user_code,
          fullName: input.full_name,
          fullNameTokens: nameBlindIndexes(input.full_name),
          mobile: input.mobile,
          mobileLookup: blindIndex(input.mobile),
          mobileLast4: last4(input.mobile) ?? '',
          email: input.email ?? null,
          emailLookup: input.email ? blindIndex(input.email) : null,
          passwordHash: hash,
          previousPasswordHashes: [],
          mustChangePassword: true,
          mfaEnabled: false,
          failedLoginCount: 0,
          isActive: true,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        }),
      );
      await writeAudit(em, { action: AUDIT.USER_CREATED, entityType: 'user', entityId: u.id, data: { user_code: u.userCode } });
      await addAssignment(auth, actorPerms, u.id, input.assignment, em);
      return u;
    });
    return { user: listView(user, await assignmentRepository.forUser(user.id)), temporary_password: temporaryPassword };
  },

  async update(auth: AuthContext, id: string, patch: UserPatch) {
    await assertUserVisible(auth, id);
    return AppDataSource.transaction(async (em) => {
      await assertCanManage(auth, id, em);
      const u = await users(em).findOne({ where: { id } });
      if (!u) throw new NotFoundError('user not found');
      if (patch.full_name !== undefined) {
        u.fullName = patch.full_name;
        u.fullNameTokens = nameBlindIndexes(patch.full_name);
      }
      if (patch.mobile !== undefined) {
        u.mobile = patch.mobile;
        u.mobileLookup = blindIndex(patch.mobile);
        u.mobileLast4 = last4(patch.mobile) ?? '';
      }
      if (patch.email !== undefined) {
        u.email = patch.email;
        u.emailLookup = patch.email ? blindIndex(patch.email) : null;
      }
      u.updatedBy = auth.userId;
      await users(em).save(u);
      await writeAudit(em, { action: AUDIT.USER_UPDATED, entityType: 'user', entityId: u.id, data: { fields: Object.keys(patch) } });
      return listView(u, await assignmentRepository.forUser(u.id, {}, em));
    });
  },

  async setActive(auth: AuthContext, id: string, active: boolean) {
    await assertUserVisible(auth, id);
    return AppDataSource.transaction(async (em) => {
      await assertCanManage(auth, id, em);
      await users(em).update({ id }, { isActive: active, updatedBy: auth.userId });
      if (!active) await sessionService.revokeAllForUser(id, 'DEACTIVATED', em);
      await writeAudit(em, { action: active ? AUDIT.USER_ACTIVATED : AUDIT.USER_DEACTIVATED, entityType: 'user', entityId: id });
      return { id, is_active: active };
    });
  },

  async unlock(auth: AuthContext, id: string) {
    await assertUserVisible(auth, id);
    return AppDataSource.transaction(async (em) => {
      await assertCanManage(auth, id, em);
      await users(em).update({ id }, { lockedUntil: null, failedLoginCount: 0, updatedBy: auth.userId });
      await writeAudit(em, { action: AUDIT.USER_UNLOCKED, entityType: 'user', entityId: id });
      return { id, is_locked: false };
    });
  },

  /** Sets a temporary password (shown once) and forces a change with OTP at next login. */
  async adminResetPassword(auth: AuthContext, id: string) {
    await assertUserVisible(auth, id);
    const temporaryPassword = generateTemporaryPassword();
    const hash = await hashPassword(temporaryPassword);
    await AppDataSource.transaction(async (em) => {
      await assertCanManage(auth, id, em);
      await users(em).update({ id }, { passwordHash: hash, mustChangePassword: true, lockedUntil: null, failedLoginCount: 0, updatedBy: auth.userId });
      await sessionService.revokeAllForUser(id, 'ADMIN', em);
      await writeAudit(em, { action: AUDIT.PASSWORD_RESET_BY_ADMIN, entityType: 'user', entityId: id });
    });
    return { temporary_password: temporaryPassword };
  },

  async listAssignments(auth: AuthContext, id: string) {
    await assertUserVisible(auth, id);
    return listView(await assertUserVisible(auth, id), await assignmentRepository.forUser(id)).assignments;
  },

  async addAssignment(auth: AuthContext, actorPerms: readonly string[], id: string, input: AssignmentInput) {
    await assertUserVisible(auth, id);
    await AppDataSource.transaction(async (em) => {
      if (id === auth.userId) throw new ForbiddenError('You cannot change your own roles.', { code: 'E_SELF_MANAGE' });
      await assertCanManage(auth, id, em);
      await addAssignment(auth, actorPerms, id, input, em);
    });
    return this.listAssignments(auth, id);
  },

  async removeAssignment(auth: AuthContext, actorPerms: readonly string[], id: string, assignmentId: string) {
    await assertUserVisible(auth, id);
    await AppDataSource.transaction(async (em) => {
      await assertCanManage(auth, id, em);
      const a = await assignmentRepository.byId(assignmentId, em);
      if (!a || a.userId !== id || !a.isActive) throw new NotFoundError('assignment not found');
      const rolePerms = await roleService.permissionCodes(a.roleId, em);
      if (!a.role || !canAssignRole({ roleCode: auth.roleCode, permissions: actorPerms }, { code: a.role.code, scopeLevel: a.role.scopeLevel, permissions: rolePerms })) {
        throw new ForbiddenError('You cannot remove this role.', { code: 'E_ROLE_NOT_ASSIGNABLE' });
      }
      await assignments(em).update({ id: a.id }, { isActive: false });
      await sessionService.revokeForAssignment(a.id, 'ASSIGNMENT_REMOVED', em);
      await writeAudit(em, {
        action: AUDIT.ASSIGNMENT_REMOVED,
        entityType: 'user',
        entityId: id,
        districtId: a.districtId,
        centerId: a.centerId,
        data: { assignment_id: a.id, role: a.role.code },
      });
    });
    return this.listAssignments(auth, id);
  },
};
