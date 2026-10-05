import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, authOf, authorize, caller } from '../../lib/auth-middleware';
import { ok } from '../../lib/envelopes';
import { P } from '../../lib/permission-codes';
import { perUser } from '../../lib/rate-limit';
import { validateBody, validateParams } from '../../lib/validate';
import { settingsService } from '../../services/settings.service';

/**
 * Everything under /core/api/v1 (docs/API_CORE.md). Phase 0: the caller context and the settings.
 * Phase 1 adds /beneficiaries, Phase 2 /applications, Phase 4 /ppo, Phase 5 /payments and /dashboard.
 * Route order is fixed (rule R-API-4): authenticate, rate limit, authorize, validate, handler.
 */
export const apiRouter = Router();
const guard: RequestHandler[] = [authenticate(), perUser({ name: 'core-api', windowMs: 60_000, limit: 120 })];

/** Who the core service thinks the caller is: proves the token, scope and permission wiring. */
apiRouter.get('/context', ...guard, async (_req, res) => {
  const c = await caller(res);
  res.json(
    ok({
      user_id: c.auth.userId,
      role: c.auth.roleCode,
      scope: c.auth.scope,
      district_id: c.auth.districtId,
      center_id: c.auth.centerId,
      center_code: c.auth.centerCode,
      permissions: [...c.perms].sort(),
    }),
  );
});

apiRouter.get('/settings', ...guard, authorize(P.MASTER_SETTINGS_VIEW), async (_req, res) => {
  res.json(ok(await settingsService.list()));
});

const settingKeyParams = z.object({ key: z.string().regex(/^[a-z_]+\.[a-z_]+$/) }).strict();
const settingBody = z.object({ value: z.unknown() }).strict();

apiRouter.put('/settings/:key', ...guard, authorize(P.MASTER_SETTINGS_EDIT), validateParams(settingKeyParams), validateBody(settingBody), async (req, res) => {
  res.json(ok(await settingsService.set(authOf(res).userId, req.params['key'] as string, (req.body as { value: unknown }).value)));
});
