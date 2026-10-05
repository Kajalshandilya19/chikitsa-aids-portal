#!/usr/bin/env node
/**
 * Creates the skeleton of a new API module in a service, following docs/HOWTO.md recipe A:
 *   src/dtos/<module>.dto.ts, src/services/<module>.service.ts, src/routes/v1/<module>.routes.ts,
 *   tests/unit/<module>.test.ts
 *
 *   node scripts/scaffold-module.mjs <auth|core|data> <kebab-plural>
 *   node scripts/scaffold-module.mjs core beneficiaries
 *
 * The generated route uses `P.TODO_CHOOSE_PERMISSION`, which does not exist: the service will NOT
 * typecheck until you pick the real permission. That is deliberate (R-RBAC-2). Nothing is mounted
 * for you; the script prints the one line to add to src/routes/v1/index.ts.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [service, mod] = process.argv.slice(2);
if (!['auth', 'core', 'data'].includes(service) || !/^[a-z][a-z0-9-]{2,40}$/.test(mod ?? '')) {
  console.error('usage: node scripts/scaffold-module.mjs <auth|core|data> <kebab-plural>');
  process.exit(2);
}
const svcDir = join(ROOT, 'services', `pension-${service}-service`);
const camel = mod.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
const pascal = camel[0].toUpperCase() + camel.slice(1);
const files = {
  [`src/dtos/${mod}.dto.ts`]: `import { z } from 'zod';
import { pageQuery, searchText, uuid } from '../lib/validators';

/**
 * Request schemas of /${mod} (docs/API_${service.toUpperCase()}.md). Built ONLY from lib/validators.ts (R-VAL-1)
 * and always .strict() (R-VAL-3).
 */
export const ${camel}ListQuery = z
  .object({
    q: searchText.optional(),
    // TODO: filters (uuid ids, z.enum for statuses). Every filter narrows INSIDE the caller's scope.
    sort: z.enum(['updated_at']).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    ...pageQuery,
  })
  .strict();
export type ${pascal}ListQuery = z.infer<typeof ${camel}ListQuery>;

export const ${camel}IdParams = z.object({ id: uuid }).strict();
`,
  [`src/services/${mod}.service.ts`]: `import type { AuthContext } from '../lib/access-token';
import type { ${pascal}ListQuery } from '../dtos/${mod}.dto';

/**
 * /${mod} use cases. Rules:
 *   - lists: applyScope(qb, auth, { district: '<alias>.district_id', center: '<alias>.center_id' })   (R-SCOPE-1)
 *   - one row: assertInScope(auth, row, '<what>')   -> 404 out of scope (R-SCOPE-2)
 *   - writes: AppDataSource.transaction(async (em) => { ...; await writeAudit(em, { action: AUDIT.X, ... }) })   (R-DB-7)
 *   - return view objects with snake_case keys and MASKED personal data (lib/mask.ts, R-PII-3)
 */
export const ${camel}Service = {
  async list(_auth: AuthContext, _q: ${pascal}ListQuery): Promise<{ rows: unknown[]; total: number }> {
    throw new Error('TODO: implement ${camel}Service.list');
  },
};
`,
  [`src/routes/v1/${mod}.routes.ts`]: `import { Router, type RequestHandler } from 'express';
import { authenticate, authOf, authorize } from '../../lib/auth-middleware';
import { paged } from '../../lib/envelopes';
import { P } from '../../lib/permission-codes';
import { perUser } from '../../lib/rate-limit';
import { validateQuery } from '../../lib/validate';
import { ${camel}ListQuery, type ${pascal}ListQuery } from '../../dtos/${mod}.dto';
import { ${camel}Service } from '../../services/${mod}.service';

/** /${mod}. Route order is fixed (R-API-4): guard (authenticate + rate limit), authorize, validate, handler. */
export const ${camel}Router = Router();
const guard: RequestHandler[] = [authenticate(), perUser({ name: '${mod}', windowMs: 60_000, limit: 120 })];

// TODO: replace P.TODO_CHOOSE_PERMISSION with the real permission (this line does not compile until you do).
${camel}Router.get('/${mod}', ...guard, authorize(P.TODO_CHOOSE_PERMISSION), validateQuery(${camel}ListQuery), async (req, res) => {
  const q = req.query as unknown as ${pascal}ListQuery;
  const r = await ${camel}Service.list(authOf(res), q);
  res.json(paged(r.rows, r.total, q));
});
`,
  [`tests/unit/${mod}.test.ts`]: `/**
 * Unit tests for /${mod}. Name every test with its id from docs/TEST_PLAN.md (R-TEST-1).
 * Endpoint behaviour (401 / 403 / 404 / 200) belongs in scripts/acceptance/phaseN.mjs (R-TEST-2).
 */
describe('${mod}', () => {
  test.todo('UT-XXX-001 <what it proves>');
});
`,
};

for (const [rel, body] of Object.entries(files)) {
  const p = join(svcDir, rel);
  if (existsSync(p)) {
    console.error(`refusing to overwrite ${rel}`);
    process.exit(1);
  }
}
for (const [rel, body] of Object.entries(files)) {
  const p = join(svcDir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
  console.log(`created services/pension-${service}-service/${rel}`);
}
console.log(`
next:
  1. in src/routes/v1/index.ts:  import { ${camel}Router } from './${mod}.routes';  apiRouter.use(${camel}Router);
  2. choose the permission (replace P.TODO_CHOOSE_PERMISSION), implement the service with applyScope/assertInScope
  3. document the endpoint in docs/API_${service.toUpperCase()}.md and the tests in docs/TEST_PLAN.md
  4. scripts/dev.sh check, then the phase acceptance script`);
