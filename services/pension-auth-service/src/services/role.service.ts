import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { PermissionEntity } from '../entities/permission.entity';
import { RoleEntity } from '../entities/role.entity';
import type { AuthContext } from '../lib/access-token';
import { AUDIT, writeAudit } from '../lib/audit';
import { clearPermissionCache } from '../lib/auth-middleware';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { canAssignRole, invalidPermissionsForScope, PERMISSION_BY_CODE } from '../domain/permissions';

/** Roles, their permissions, and the permission catalogue (docs/API_AUTH.md §6). */
export const roleService = {
  /** The resolver behind authorize() in this service, and behind /internal/roles/:id/permissions. */
  async permissionCodes(roleId: string, em?: EntityManager): Promise<string[]> {
    const rows = (await (em ?? AppDataSource.manager).query(
      `SELECT rp.permission_code AS code FROM pension_auth.role_permissions rp
       JOIN pension_auth.roles r ON r.id = rp.role_id WHERE r.id = $1 AND r.is_active ORDER BY 1`,
      [roleId],
    )) as { code: string }[];
    return rows.map((r) => r.code);
  },

  async list(auth: AuthContext, actorPerms: readonly string[]) {
    const roles = await AppDataSource.getRepository(RoleEntity).find({ order: { sortOrder: 'ASC' } });
    const out = [];
    for (const r of roles) {
      const perms = await this.permissionCodes(r.id);
      out.push({
        id: r.id,
        code: r.code,
        name_en: r.nameEn,
        name_hi: r.nameHi,
        scope_level: r.scopeLevel,
        mfa_required: r.mfaRequired,
        is_active: r.isActive,
        permissions_customized: r.permissionsCustomized,
        permission_count: perms.length,
        assignable: r.isActive && canAssignRole({ roleCode: auth.roleCode, permissions: actorPerms }, { code: r.code, scopeLevel: r.scopeLevel, permissions: perms }),
      });
    }
    return out;
  },

  async get(id: string) {
    const r = await AppDataSource.getRepository(RoleEntity).findOne({ where: { id } });
    if (!r) throw new NotFoundError('role not found');
    return {
      id: r.id,
      code: r.code,
      name_en: r.nameEn,
      name_hi: r.nameHi,
      scope_level: r.scopeLevel,
      mfa_required: r.mfaRequired,
      is_active: r.isActive,
      permissions_customized: r.permissionsCustomized,
      permissions: await this.permissionCodes(r.id),
    };
  },

  async catalogue() {
    const rows = await AppDataSource.getRepository(PermissionEntity).find({ order: { sortOrder: 'ASC' } });
    return rows.map((p) => ({
      code: p.code,
      section: p.section,
      resource: p.resource,
      action: p.action,
      label_en: p.labelEn,
      label_hi: p.labelHi,
      allowed_scopes: p.allowedScopes,
      delegable: p.delegable,
      sensitive: p.sensitive,
    }));
  },

  /** Super admin only (ROLE_PERMISSIONS_EDIT is non-delegable). Marks the role customised so rbac sync keeps it. */
  async setPermissions(id: string, codes: string[]) {
    const unique = [...new Set(codes)];
    const unknown = unique.filter((c) => !PERMISSION_BY_CODE.has(c));
    if (unknown.length) throw new BadRequestError('Unknown permission codes.', { code: 'E_PERMISSION_UNKNOWN', details: { codes: unknown } });
    return AppDataSource.transaction(async (em) => {
      const role = await em.getRepository(RoleEntity).findOne({ where: { id } });
      if (!role) throw new NotFoundError('role not found');
      const bad = invalidPermissionsForScope(role.scopeLevel, unique);
      if (bad.length) {
        throw new BadRequestError(`These permissions cannot be held by a ${role.scopeLevel} role.`, { code: 'E_PERMISSION_SCOPE', details: { codes: bad } });
      }
      const before = await this.permissionCodes(id, em);
      await em.query('DELETE FROM pension_auth.role_permissions WHERE role_id = $1', [id]);
      if (unique.length) {
        await em.query('INSERT INTO pension_auth.role_permissions (role_id, permission_code) SELECT $1, unnest($2::varchar[])', [id, unique]);
      }
      await em.query('UPDATE pension_auth.roles SET permissions_customized = true, updated_at = now() WHERE id = $1', [id]);
      await writeAudit(em, {
        action: AUDIT.ROLE_PERMISSIONS_CHANGED,
        entityType: 'role',
        entityId: id,
        data: { role: role.code, added: unique.filter((c) => !before.includes(c)), removed: before.filter((c) => !unique.includes(c)) },
      });
      clearPermissionCache(id);
      return this.get(id);
    });
  },
};
