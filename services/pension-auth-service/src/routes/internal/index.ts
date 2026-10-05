import { Router } from 'express';
import { ok } from '../../lib/envelopes';
import { validateBody, validateParams } from '../../lib/validate';
import { centerUpsertBatchSchema, idParams, type CenterUpsertBatch } from '../../dtos/master.dto';
import { masterService } from '../../services/master.service';
import { roleService } from '../../services/role.service';

/**
 * /auth/api/v1/internal/* : service token ONLY (mounted behind requireServiceToken by lib/http-app.ts).
 * The BFF refuses to proxy any path starting with internal/ (docs/API_AUTH.md §8).
 */
export const internalRouter = Router();

internalRouter.get('/roles/:id/permissions', validateParams(idParams), async (req, res) => {
  res.json(ok(await roleService.permissionCodes(req.params['id'] as string)));
});

internalRouter.get('/districts', async (_req, res) => {
  res.json(ok(await masterService.allDistricts()));
});

internalRouter.get('/centers', async (_req, res) => {
  res.json(ok(await masterService.allCenters()));
});

internalRouter.post('/centers/upsert-batch', validateBody(centerUpsertBatchSchema), async (req, res) => {
  const b = req.body as CenterUpsertBatch;
  res.json(ok(await masterService.upsertCenters(b.actor_user_id, b.rows)));
});
