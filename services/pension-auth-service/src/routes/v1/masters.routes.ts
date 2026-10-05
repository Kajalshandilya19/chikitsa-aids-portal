import { Router, type RequestHandler } from 'express';
import { authenticate, authOf, authorize } from '../../lib/auth-middleware';
import { ok, paged } from '../../lib/envelopes';
import { P } from '../../lib/permission-codes';
import { validateBody, validateParams, validateQuery } from '../../lib/validate';
import {
  centerCreateSchema,
  centerListQuery,
  centerPatchSchema,
  districtListQuery,
  districtPatchSchema,
  idParams,
  type CenterCreate,
  type CenterListQuery,
  type CenterPatch,
  type DistrictPatch,
} from '../../dtos/master.dto';
import { masterService } from '../../services/master.service';
import { limits } from './limits';

/** /districts and /centers (docs/API_AUTH.md §4). */
export const mastersRouter = Router();
/** Every route: logged in, then the per-user admin rate limit. Applied per route, never with router.use(). */
const guard: RequestHandler[] = [authenticate(), limits.admin];

mastersRouter.get('/districts', ...guard, authorize(P.MASTER_DISTRICT_VIEW), validateQuery(districtListQuery), async (req, res) => {
  res.json(ok(await masterService.listDistricts((req.query as { is_active?: boolean }).is_active)));
});

mastersRouter.patch('/districts/:id', ...guard, authorize(P.MASTER_DISTRICT_EDIT), validateParams(idParams), validateBody(districtPatchSchema), async (req, res) => {
  res.json(ok(await masterService.updateDistrict(req.params['id'] as string, req.body as DistrictPatch)));
});

mastersRouter.get('/centers', ...guard, authorize(P.MASTER_CENTER_VIEW), validateQuery(centerListQuery), async (req, res) => {
  const q = req.query as unknown as CenterListQuery;
  const r = await masterService.listCenters(authOf(res), q);
  res.json(paged(r.rows, r.total, q));
});

mastersRouter.get('/centers/:id', ...guard, authorize(P.MASTER_CENTER_VIEW), validateParams(idParams), async (req, res) => {
  res.json(ok(await masterService.getCenter(authOf(res), req.params['id'] as string)));
});

mastersRouter.post('/centers', ...guard, authorize(P.MASTER_CENTER_CREATE), validateBody(centerCreateSchema), async (req, res) => {
  res.status(201).json(ok(await masterService.createCenter(authOf(res), req.body as CenterCreate)));
});

mastersRouter.patch('/centers/:id', ...guard, authorize(P.MASTER_CENTER_EDIT), validateParams(idParams), validateBody(centerPatchSchema), async (req, res) => {
  res.json(ok(await masterService.updateCenter(authOf(res), req.params['id'] as string, req.body as CenterPatch)));
});

mastersRouter.post('/centers/:id/activate', ...guard, authorize(P.MASTER_CENTER_EDIT), validateParams(idParams), async (req, res) => {
  res.json(ok(await masterService.setCenterActive(authOf(res), req.params['id'] as string, true)));
});

mastersRouter.post('/centers/:id/deactivate', ...guard, authorize(P.MASTER_CENTER_EDIT), validateParams(idParams), async (req, res) => {
  res.json(ok(await masterService.setCenterActive(authOf(res), req.params['id'] as string, false)));
});
