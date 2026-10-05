#!/usr/bin/env node
/**
 * End-to-end smoke test of pension-auth-service against the LOCAL stack (docs/TEST_PLAN.md, IT-AUTH-*).
 *
 *   scripts/dev.sh infra-up && scripts/dev.sh migrate && scripts/dev.sh seed && scripts/dev.sh start auth
 *   node scripts/smoke-auth.mjs
 *
 * Uses the seeded dev users (DEV_USER_PASSWORD from env/local.env) and the captcha's `dev_answer`, which
 * only exists when APP_ENV=local. Leaves extra rows behind (a smoke user, audit events): run it on a
 * local database only, never against UAT or production.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(ROOT, 'env/local.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.APP_ENV !== 'local') {
  console.error('refusing to run: APP_ENV is not local');
  process.exit(2);
}
const BASE = `${process.env.AUTH_SERVICE_URL ?? 'http://127.0.0.1:3201'}/auth/api/v1`;
const PW = process.env.DEV_USER_PASSWORD;

let passed = 0;
let failed = 0;
const check = (id, label, cond, extra) => {
  if (cond) {
    passed++;
    console.log(`PASS ${id} ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${id} ${label}${extra ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ''}`);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Re-running the scripts back to back can hit the per-user login limit (that is the limiter working): wait and retry once. */
const call = async (method, path, { token, body, headers = {} } = {}, retried = false) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 429 && !retried && !path.startsWith('/auth/login')) {
    console.log(`  (rate limited on ${path}, waiting 61 s)`);
    await sleep(61_000);
    return call(method, path, { token, body, headers }, true);
  }
  return { status: res.status, body: json };
};

const captcha = async () => (await call('GET', '/captcha')).body.data;

const login = async (user_code, password = PW, center_code, retried = false) => {
  const c = await captcha();
  const r = await call('POST', '/auth/login', {
    body: { user_code, password, ...(center_code ? { center_code } : {}), captcha_token: c.token, captcha_answer: c.dev_answer },
  });
  if (r.status === 429 && !retried) {
    console.log(`  (login rate limit for ${user_code}, waiting 61 s)`);
    await sleep(61_000);
    return login(user_code, password, center_code, true);
  }
  return r;
};

const token = async (user, center) => {
  const r = await login(user, PW, center);
  if (r.body?.data?.step !== 'DONE') throw new Error(`login ${user} did not finish: ${JSON.stringify(r.body)}`);
  return r.body.data;
};

const main = async () => {
  // ---- health and captcha
  const c = await captcha();
  check('IT-AUTH-01', 'captcha image has no <text> and a token', c.token && !Buffer.from(c.image.split(',')[1], 'base64').toString().includes('<text'));

  // ---- login by Center code
  const w1 = await login('worker.rj001', PW, 'RJ001');
  check('IT-AUTH-02', 'worker logs in with Center code RJ001', w1.body?.data?.step === 'DONE', w1.body);
  const wrongCenter = await login('worker.rj001', PW, 'RJ002');
  check('IT-AUTH-03', 'same worker with another Center code gets the generic 401', wrongCenter.status === 401 && wrongCenter.body?.code === 'E_INVALID_CREDENTIALS', wrongCenter.body);
  const noCenter = await login('worker.rj001', PW);
  check('IT-AUTH-04', 'worker without a Center code is told to enter one', noCenter.body?.code === 'E_CENTER_CODE_REQUIRED', noCenter.body);
  const unknown = await login('nobody.here', PW);
  check('IT-AUTH-05', 'unknown User ID gets the same generic 401', unknown.status === 401 && unknown.body?.code === 'E_INVALID_CREDENTIALS', unknown.body);
  const reused = await (async () => {
    await sleep(61_000); // fresh login-rate-limit window for this user, so the 429 cannot mask the check
    const cc = await captcha();
    await call('POST', '/auth/login', { body: { user_code: 'worker.rj001', password: PW, center_code: 'RJ001', captcha_token: cc.token, captcha_answer: cc.dev_answer } });
    return call('POST', '/auth/login', { body: { user_code: 'worker.rj001', password: PW, center_code: 'RJ001', captcha_token: cc.token, captcha_answer: cc.dev_answer } });
  })();
  check('IT-AUTH-06', 'a captcha token works once only', reused.body?.code === 'E_CAPTCHA_USED', reused.body);

  // ---- me, scope on Centers
  const worker = w1.body.data;
  const me = await call('GET', '/auth/me', { token: worker.access_token });
  check('IT-AUTH-07', '/auth/me shows role center_worker at RJ001 with permissions', me.body?.data?.role?.code === 'center_worker' && me.body?.data?.center?.code === 'RJ001' && me.body.data.permissions.length > 5, me.body);
  const wc = await call('GET', '/centers', { token: worker.access_token });
  check('IT-SCOPE-01', 'worker sees exactly one Center (its own)', wc.body?.meta?.total === 1 && wc.body.data[0].code === 'RJ001', wc.body?.meta);
  const sa = await token('stateadmin');
  const allCenters = await call('GET', '/centers?limit=100', { token: sa.access_token });
  check('IT-SCOPE-02', 'state admin sees every Center (41 seeded, more after smoke-data)', allCenters.body?.meta?.total >= 41, allCenters.body?.meta);
  const rj002 = allCenters.body.data.find((x) => x.code === 'RJ002');
  const peek = await call('GET', `/centers/${rj002.id}`, { token: worker.access_token });
  check('IT-SCOPE-03', 'worker asking for another Center by id gets 404, not 403', peek.status === 404, peek.body);
  const dist = await token('dapcu.ajmer');
  const dc = await call('GET', '/centers', { token: dist.access_token });
  check('IT-SCOPE-04', 'district officer sees only Centers of Ajmer', dc.body?.meta?.total >= 1 && dc.body.data.every((x) => x.district.code === 'AJMER'), dc.body?.meta);

  // ---- permissions
  const wu = await call('GET', '/users', { token: worker.access_token });
  check('IT-RBAC-01', 'worker cannot list users (403 E_PERMISSION)', wu.status === 403 && wu.body?.code === 'E_PERMISSION', wu.body);
  const roles = await call('GET', '/roles', { token: sa.access_token });
  const roleId = (code) => roles.body.data.find((r) => r.code === code).id;
  check('IT-RBAC-02', 'state admin: worker role assignable, verifier role not', roles.body.data.find((r) => r.code === 'center_worker').assignable && !roles.body.data.find((r) => r.code === 'state_verifier').assignable);

  // ---- create a user, temp password, forced change
  const code = `smoke.${Date.now().toString(36)}`;
  const rj003 = allCenters.body.data.find((x) => x.code === 'RJ003');
  const created = await call('POST', '/users', {
    token: sa.access_token,
    body: { user_code: code, full_name: 'Smoke Test Worker', mobile: `9${String(Date.now()).slice(-9)}`, assignment: { role_id: roleId('center_worker'), center_id: rj003.id } },
  });
  check('IT-USER-01', 'state admin creates a worker; a temporary password is returned once', created.status === 201 && /.{12}/.test(created.body?.data?.temporary_password ?? ''), created.body);
  const verifierTry = await call('POST', `/users/${created.body.data.user.id}/assignments`, { token: sa.access_token, body: { role_id: roleId('state_verifier') } });
  check('IT-USER-02', 'state admin cannot give anyone a State role', verifierTry.status === 403 && verifierTry.body?.code === 'E_ROLE_NOT_ASSIGNABLE', verifierTry.body);
  const temp = await login(code, created.body.data.temporary_password, 'RJ003');
  check('IT-USER-03', 'new user logs in with must_change_password = true', temp.body?.data?.must_change_password === true, temp.body);
  const blocked = await call('GET', '/centers', { token: temp.body.data.access_token });
  check('IT-USER-04', 'until the password is changed every other route answers E_PASSWORD_CHANGE_REQUIRED', blocked.body?.code === 'E_PASSWORD_CHANGE_REQUIRED', blocked.body);
  const listMasked = await call('GET', `/users?q=${encodeURIComponent(code)}`, { token: sa.access_token });
  check('IT-PII-01', 'user list shows masked mobile only', /^9\dX+\d\d$/.test(listMasked.body?.data?.[0]?.mobile_masked ?? '') && !('mobile' in (listMasked.body?.data?.[0] ?? {})), listMasked.body?.data?.[0]);

  // ---- refresh rotation and replay
  const r1 = await call('POST', '/auth/refresh', { body: { refresh_token: worker.refresh_token } });
  check('IT-SESS-01', 'refresh returns a new refresh token', r1.status === 200 && r1.body.data.refresh_token !== worker.refresh_token, r1.body);
  const replay = await call('POST', '/auth/refresh', { body: { refresh_token: worker.refresh_token } });
  check('IT-SESS-02', 'reusing the old refresh token is a replay', replay.body?.code === 'E_REFRESH_REPLAY', replay.body);
  const afterReplay = await call('GET', '/auth/me', { token: r1.body.data.access_token });
  check('IT-SESS-03', 'after a replay the whole session is dead, even the newest access token', afterReplay.status === 401, afterReplay.body);

  // ---- logout
  const w2 = await token('worker.rj002', 'RJ002');
  await call('POST', '/auth/logout', { token: w2.access_token, body: {} });
  const afterLogout = await call('GET', '/auth/me', { token: w2.access_token });
  check('IT-SESS-04', 'access token is refused after logout', afterLogout.status === 401, afterLogout.body);

  // ---- lockout and unlock
  for (let i = 0; i < Number(process.env.PASSWORD_MAX_FAILED ?? 5); i++) await login(code, 'Wrong@Password1', 'RJ003');
  const locked = await login(code, created.body.data.temporary_password, 'RJ003');
  check('IT-AUTH-08', 'after N wrong passwords the account is locked (423) even with the right one', locked.status === 423 && locked.body?.code === 'E_ACCOUNT_LOCKED', locked.body);
  const unlock = await call('POST', `/users/${created.body.data.user.id}/unlock`, { token: sa.access_token, body: {} });
  const afterUnlock = await login(code, created.body.data.temporary_password, 'RJ003');
  check('IT-AUTH-09', 'state admin unlocks; login works again', unlock.status === 200 && afterUnlock.body?.data?.step === 'DONE', afterUnlock.body);

  // ---- input guards
  const xss = await call('PATCH', `/centers/${rj003.id}`, { token: sa.access_token, body: { name_en: '<script>alert(1)</script>' } });
  check('IT-SEC-01', 'script markup in a body is refused (400 E_UNSAFE_INPUT)', xss.status === 400 && xss.body?.code === 'E_UNSAFE_INPUT', xss.body);
  const extra = await call('PATCH', `/centers/${rj003.id}`, { token: sa.access_token, body: { name_en: 'ART Centre Test', is_admin: true } });
  check('IT-SEC-02', 'unknown body keys are refused (422)', extra.status === 422, extra.body);
  const internal = await call('GET', '/internal/centers');
  check('IT-SEC-03', 'internal routes refuse calls without a service token', internal.status === 401 && internal.body?.code === 'E_SERVICE_TOKEN', internal.body);
  const forged = await call('GET', '/internal/centers', { headers: { 'x-service-token': sa.access_token } });
  check('IT-SEC-04', 'a user access token is not a service token', forged.status === 401, forged.body);

  // ---- audit
  const aud = await token('auditor');
  const log = await call('GET', '/audit?limit=5', { token: aud.access_token });
  check('IT-AUD-01', 'auditor reads the audit log', log.status === 200 && log.body.meta.total > 0, log.body?.meta);
  const verify = await call('GET', '/audit/verify', { token: aud.access_token });
  check('IT-AUD-02', 'hash chain verifies', verify.status === 200 && verify.body.data.every((c) => c.ok), verify.body);
  const workerAudit = await call('GET', '/audit', { token: worker.access_token });
  check('IT-AUD-03', 'worker cannot read the audit log', workerAudit.status === 401 || workerAudit.status === 403);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
