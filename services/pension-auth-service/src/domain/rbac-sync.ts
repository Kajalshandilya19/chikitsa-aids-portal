import type { EntityManager } from 'typeorm';
import { PERMISSIONS, ROLE_TEMPLATES, actionOf, resourceOf, sectionOf } from './permissions';

/**
 * Brings the database catalogue in line with code. Idempotent; run by `npm run seed` locally and by the
 * seed Job in Kubernetes after every migration.
 *   1. upsert every permission in PERMISSIONS
 *   2. delete permissions no longer in code (role grants cascade away)
 *   3. upsert the role templates and reset each one's permissions to the code default, EXCEPT a role a
 *      super admin has edited (`permissions_customized = true`)
 */
export const syncRbacCatalogue = async (em: EntityManager): Promise<{ permissions: number; pruned: number; roles: number }> => {
  let sort = 0;
  for (const p of PERMISSIONS) {
    await em.query(
      `INSERT INTO pension_auth.permissions (code, section, resource, action, label_en, label_hi, allowed_scopes, delegable, sensitive, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (code) DO UPDATE SET section = EXCLUDED.section, resource = EXCLUDED.resource, action = EXCLUDED.action,
         label_en = EXCLUDED.label_en, label_hi = EXCLUDED.label_hi, allowed_scopes = EXCLUDED.allowed_scopes,
         delegable = EXCLUDED.delegable, sensitive = EXCLUDED.sensitive, sort_order = EXCLUDED.sort_order`,
      [p.code, sectionOf(p.code), resourceOf(p.code), actionOf(p.code), p.en, p.hi, p.scopes, p.delegable, p.sensitive, (sort += 10)],
    );
  }
  const codes = PERMISSIONS.map((p) => p.code);
  // For DELETE, TypeORM's postgres driver returns [rows, rowCount], not rows.
  const deleted = (await em.query('DELETE FROM pension_auth.permissions WHERE NOT (code = ANY($1::varchar[])) RETURNING code', [codes])) as [unknown[], number];
  const pruned = deleted[0];

  let order = 0;
  for (const t of ROLE_TEMPLATES) {
    const rows = (await em.query(
      `INSERT INTO pension_auth.roles (code, name_en, name_hi, scope_level, mfa_required, is_system, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, true, true, $6)
       ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_hi = EXCLUDED.name_hi, scope_level = EXCLUDED.scope_level,
         mfa_required = EXCLUDED.mfa_required, is_system = true, sort_order = EXCLUDED.sort_order, updated_at = now()
       RETURNING id, permissions_customized`,
      [t.code, t.en, t.hi, t.scope, t.mfaRequired, (order += 10)],
    )) as { id: string; permissions_customized: boolean }[];
    const role = rows[0];
    if (!role || role.permissions_customized) continue;
    await em.query('DELETE FROM pension_auth.role_permissions WHERE role_id = $1', [role.id]);
    await em.query(
      'INSERT INTO pension_auth.role_permissions (role_id, permission_code) SELECT $1, unnest($2::varchar[]) ON CONFLICT DO NOTHING',
      [role.id, [...new Set(t.permissions)]],
    );
  }
  return { permissions: codes.length, pruned: pruned.length, roles: ROLE_TEMPLATES.length };
};
