import { Router, type RequestHandler } from 'express';
import { authenticate, authorize, caller } from '../../lib/auth-middleware';
import { ok, paged } from '../../lib/envelopes';
import { P } from '../../lib/permission-codes';
import { validateBody, validateParams, validateQuery } from '../../lib/validate';
import { auditListQuery, rolePermissionsSchema, type AuditListQuery } from '../../dtos/audit.dto';
import { idParams } from '../../dtos/master.dto';
import { auditQueryService } from '../../services/audit-query.service';
import { roleService } from '../../services/role.service';
import { limits } from './limits';

/** /roles, /permissions, /audit (docs/API_AUTH.md §6-7). */
export const rolesAuditRouter = Router();
/** Every route: logged in, then the per-user admin rate limit. Applied per route, never with router.use(). */
const guard: RequestHandler[] = [authenticate(), limits.admin];

rolesAuditRouter.get('/roles', ...guard, authorize(P.ROLE_CATALOGUE_VIEW, P.USER_ASSIGNMENT_MANAGE), async (_req, res) => {
  const c = await caller(res);
  res.json(ok(await roleService.list(c.auth, c.perms)));
});

rolesAuditRouter.get('/roles/:id', ...guard, authorize(P.ROLE_CATALOGUE_VIEW), validateParams(idParams), async (req, res) => {
  res.json(ok(await roleService.get(req.params['id'] as string)));
});

rolesAuditRouter.put('/roles/:id/permissions', ...guard, authorize(P.ROLE_PERMISSIONS_EDIT), validateParams(idParams), validateBody(rolePermissionsSchema), async (req, res) => {
  res.json(ok(await roleService.setPermissions(req.params['id'] as string, (req.body as { permissions: string[] }).permissions)));
});

rolesAuditRouter.get('/permissions', ...guard, authorize(P.ROLE_CATALOGUE_VIEW), async (_req, res) => {
  res.json(ok(await roleService.catalogue()));
});

rolesAuditRouter.get('/audit', ...guard, authorize(P.AUDIT_LOG_VIEW), validateQuery(auditListQuery), async (req, res) => {
  const q = req.query as unknown as AuditListQuery;
  const r = await auditQueryService.list(q);
  res.json(paged(r.rows, r.total, q));
});

rolesAuditRouter.get('/audit/verify', ...guard, authorize(P.AUDIT_CHAIN_VERIFY), async (_req, res) => {
  res.json(ok(await auditQueryService.verifyAll()));
});
