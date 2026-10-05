/**
 * Shared helpers for the smoke and acceptance scripts (scripts/smoke-*.mjs, scripts/acceptance/*.mjs).
 *
 * - Loads env/local.env and REFUSES to run unless APP_ENV=local (these scripts create data).
 * - `check(id, label, cond, extra)` prints PASS / FAIL.
 * - A route that does not exist yet (404 "route not found") is reported as TODO, not FAIL, so an
 *   acceptance script shows how far a phase has got. `finish()` exits non-zero on any FAIL, and on any
 *   TODO unless `--allow-todo` is passed.
 * - Logs in through the auth-service directly, using the captcha `dev_answer` that only exists locally.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const envFile = join(ROOT, 'env/local.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.APP_ENV !== 'local') {
  console.error('refusing to run: APP_ENV is not local (these scripts write test data)');
  process.exit(2);
}

export const PW = process.env.DEV_USER_PASSWORD;
export const BASE = {
  auth: `${process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3201'}/auth/api/v1`,
  core: `${process.env.CORE_SERVICE_URL ?? 'http://127.0.0.1:3202'}/core/api/v1`,
  data: `${process.env.DATA_SERVICE_URL ?? 'http://127.0.0.1:3203'}/data/api/v1`,
};
const ALLOW_TODO = process.argv.includes('--allow-todo');

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const counts = { pass: 0, fail: 0, todo: 0 };

/** A response is "not built yet" when the service answers its generic unknown-route 404. */
export const notBuilt = (r) => r?.status === 404 && typeof r?.body?.message === 'string' && r.body.message.startsWith('route not found');

/**
 * check(id, label, cond, extra, response?)
 * Pass the response as the 5th argument so an unbuilt route is reported as TODO instead of FAIL.
 */
export const check = (id, label, cond, extra, response) => {
  if (response && notBuilt(response)) {
    counts.todo++;
    console.log(`TODO ${id} ${label}  (route not built yet)`);
    return false;
  }
  if (cond) {
    counts.pass++;
    console.log(`PASS ${id} ${label}`);
    return true;
  }
  counts.fail++;
  console.log(`FAIL ${id} ${label}${extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  return false;
};

/** Marks a whole step as blocked by an earlier TODO / FAIL without calling the API. */
export const skip = (id, label, why) => {
  counts.todo++;
  console.log(`TODO ${id} ${label}  (skipped: ${why})`);
};

/**
 * A flow helper (scripts/lib/flows.mjs) throws when a step it depends on is not built or not working.
 * Report that as BLOCKED with the reason instead of a stack trace, and fail the run.
 */
const blocked = (err) => {
  counts.todo++;
  console.log(`BLOCKED ${err instanceof Error ? err.message : String(err)}`);
  console.log(`\n${counts.pass} passed, ${counts.fail} failed, ${counts.todo} todo (stopped early)`);
  process.exit(1);
};
process.on('uncaughtException', blocked);
process.on('unhandledRejection', blocked);

export const finish = () => {
  console.log(`\n${counts.pass} passed, ${counts.fail} failed, ${counts.todo} todo`);
  process.exit(counts.fail || (counts.todo && !ALLOW_TODO) ? 1 : 0);
};

/** call('core', 'GET', '/beneficiaries', { token, body, form, headers }) -> { status, type, body } */
export const call = async (svc, method, path, { token, body, form, headers = {} } = {}, retried = false) => {
  const h = { ...headers };
  if (token) h.authorization = `Bearer ${token}`;
  if (body !== undefined) h['content-type'] = 'application/json';
  const res = await fetch(`${BASE[svc]}${path}`, { method, headers: h, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const type = res.headers.get('content-type') ?? '';
  const out = { status: res.status, type, headers: res.headers, body: type.includes('json') ? await res.json().catch(() => null) : Buffer.from(await res.arrayBuffer()) };
  if (res.status === 429 && !retried) {
    console.log(`  (rate limited on ${path}, waiting 61 s)`);
    await sleep(61_000);
    return call(svc, method, path, { token, body, form, headers }, true);
  }
  return out;
};

/** Logs in a seeded dev user (docs/SEED_DATA.md §5) and returns the access token. */
export const login = async (userCode, centerCode) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const c = (await call('auth', 'GET', '/captcha')).body.data;
    const r = await call('auth', 'POST', '/auth/login', {
      body: { user_code: userCode, password: PW, ...(centerCode ? { center_code: centerCode } : {}), captcha_token: c.token, captcha_answer: c.dev_answer },
    });
    if (r.status === 429) {
      console.log(`  (login rate limit for ${userCode}, waiting 61 s)`);
      await sleep(61_000);
      continue;
    }
    if (r.body?.data?.step !== 'DONE') throw new Error(`login ${userCode} failed: ${JSON.stringify(r.body)}`);
    return r.body.data.access_token;
  }
  throw new Error(`login ${userCode}: still rate limited`);
};

/** Multipart upload of an in-memory file. */
export const upload = (svc, path, token, fileName, content, field = 'file') => {
  const form = new FormData();
  form.append(field, new Blob([content]), fileName);
  return call(svc, 'POST', path, { token, form });
};

/** The standard four-way check every endpoint must pass (R-TEST-2). */
export const guardChecks = async (idPrefix, label, { svc, method, path, body, allowed, forbidden, outOfScope }) => {
  const noToken = await call(svc, method, path, { body });
  check(`${idPrefix}a`, `${label}: no token is 401`, noToken.status === 401, noToken.body, noToken);
  if (forbidden) {
    const r = await call(svc, method, path, { token: forbidden, body });
    check(`${idPrefix}b`, `${label}: role without the permission is 403`, r.status === 403, r.body, r);
  }
  if (outOfScope) {
    const r = await call(svc, method, outOfScope.path ?? path, { token: outOfScope.token, body });
    check(`${idPrefix}c`, `${label}: out of scope is 404`, r.status === 404 && !notBuilt(r), r.body, r);
  }
  if (allowed) {
    const r = await call(svc, method, path, { token: allowed, body });
    check(`${idPrefix}d`, `${label}: allowed role succeeds`, r.status >= 200 && r.status < 300, r.body, r);
    return r;
  }
  return null;
};
