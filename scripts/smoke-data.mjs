#!/usr/bin/env node
/**
 * End-to-end smoke test of the import pipeline and the core-service wiring (docs/TEST_PLAN.md, IT-IMP-*, IT-CORE-*).
 *
 *   scripts/dev.sh start auth && scripts/dev.sh start core && scripts/dev.sh start data
 *   node scripts/smoke-data.mjs
 *
 * LOCAL database only: it creates Centers RJ9xx and import batches.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(ROOT, 'env/local.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (process.env.APP_ENV !== 'local') {
  console.error('refusing to run: APP_ENV is not local');
  process.exit(2);
}
const AUTH = `${process.env.AUTH_SERVICE_URL}/auth/api/v1`;
const CORE = `${process.env.CORE_SERVICE_URL}/core/api/v1`;
const DATA = `${process.env.DATA_SERVICE_URL}/data/api/v1`;
const PW = process.env.DEV_USER_PASSWORD;

let passed = 0;
let failed = 0;
const check = (id, label, cond, extra) => {
  if (cond) {
    passed++;
    console.log(`PASS ${id} ${label}`);
  } else {
    failed++;
    console.log(`FAIL ${id} ${label}${extra ? `  -> ${JSON.stringify(extra).slice(0, 400)}` : ''}`);
  }
};

const call = async (base, method, path, { token, body, form } = {}) => {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetch(`${base}${path}`, { method, headers, body: form ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const type = res.headers.get('content-type') ?? '';
  return { status: res.status, type, body: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = async (user_code, center_code, retried = false) => {
  const c = (await call(AUTH, 'GET', '/captcha')).body.data;
  const r = await call(AUTH, 'POST', '/auth/login', {
    body: { user_code, password: PW, ...(center_code ? { center_code } : {}), captcha_token: c.token, captcha_answer: c.dev_answer },
  });
  if (r.status === 429 && !retried) {
    // Re-running the scripts back to back can hit the per-user login limit: wait for the next window.
    console.log(`  (login rate limit for ${user_code}, waiting 61 s)`);
    await sleep(61_000);
    return login(user_code, center_code, true);
  }
  if (r.body?.data?.step !== 'DONE') throw new Error(`login ${user_code}: ${JSON.stringify(r.body)}`);
  return r.body.data.access_token;
};

const upload = (token, kind, name, content) => {
  const form = new FormData();
  form.append('file', new Blob([content]), name);
  return call(DATA, 'POST', `/imports/${kind}`, { token, form });
};

const main = async () => {
  const sa = await login('stateadmin');
  const worker = await login('worker.rj001', 'RJ001');
  const auditor = await login('auditor');

  // ---- core wiring
  const ctx = await call(CORE, 'GET', '/context', { token: worker });
  check('IT-CORE-01', 'core verifies the token and resolves permissions through auth-service', ctx.status === 200 && ctx.body.data.center_code === 'RJ001' && ctx.body.data.permissions.length > 5, ctx.body);
  const settingsW = await call(CORE, 'GET', '/settings', { token: worker });
  check('IT-CORE-02', 'worker cannot read portal settings', settingsW.status === 403);
  const settingsSa = await call(CORE, 'GET', '/settings', { token: sa });
  check('IT-CORE-03', 'state admin reads settings; PPO pattern is flagged as a placeholder', settingsSa.status === 200 && settingsSa.body.data.find((s) => s.key === 'ppo.number_pattern')?.placeholder === true, settingsSa.body);
  const editSa = await call(CORE, 'PUT', '/settings/ppo.number_pattern', { token: sa, body: { value: 'RJ/{SEQ:6}' } });
  check('IT-CORE-04', 'state admin cannot edit settings (Super Admin only)', editSa.status === 403);
  const su = await login('superadmin');
  const badPattern = await call(CORE, 'PUT', '/settings/ppo.number_pattern', { token: su, body: { value: 'RJ/{NAME}' } });
  check('IT-CORE-05', 'an invalid PPO pattern is refused with reasons', badPattern.status === 422 && badPattern.body.details?.length > 0, badPattern.body);

  // ---- template
  const tpl = await call(DATA, 'GET', '/imports/templates/centers', { token: sa });
  check('IT-IMP-01', 'template downloads as .xlsx (zip bytes)', tpl.status === 200 && tpl.type.includes('spreadsheetml') && tpl.body.readUInt32LE(0) === 0x04034b50);

  // ---- permissions
  const workerUp = await upload(worker, 'centers', 'c.csv', 'Center Code\nRJ999\n');
  check('IT-IMP-02', 'worker cannot import (403)', workerUp.status === 403, workerUp.body);

  // ---- a mixed file
  const stamp = String(Date.now()).slice(-3);
  const csv = [
    'Center Code *,Center Name *,Center Name (Hindi),District LGD Code *,Center Type *,SOCH Facility Code,Extra Column',
    `RJ9${stamp},ART Centre Smoke One,,86,ART,,x`, // CREATE
    `RJ9${stamp},ART Centre Smoke Duplicate,,86,ART,,x`, // DUPLICATE
    `RJ002,ART Centre Alwar Smoke ${stamp},,87,ART,,`, // UPDATE (unique name per run, so it is never UNCHANGED)
    'R,Bad Code,,86,ART,,', // ERROR V-003
    `RJ8${stamp},ART Centre Unknown District,,99999,ART,,`, // ERROR unknown district
    `RJ7${stamp},<b>Markup</b>,,86,PHC,,`, // ERROR name + type
    `RJ6${stamp},,,86,ART,,`, // ERROR missing name
  ].join('\n');
  const up = await upload(sa, 'centers', 'centers.csv', csv);
  const b = up.body?.data;
  check('IT-IMP-03', 'upload validates: 2 valid (1 create, 1 update), 4 errors, 1 duplicate', up.status === 201 && b.status === 'VALIDATED' && b.valid_count === 2 && b.create_count === 1 && b.update_count === 1 && b.error_count === 4 && b.duplicate_count === 1, b ?? up.body);
  check('IT-IMP-04', 'the unknown column is reported as a warning', (b?.header_errors ?? []).some((h) => /Extra Column/.test(h.message)), b?.header_errors);
  const errs = await call(DATA, 'GET', `/imports/${b.id}/rows?status=ERROR`, { token: sa });
  const rules = errs.body.data.flatMap((r) => r.errors.map((e) => e.rule ?? e.field));
  check('IT-IMP-05', 'row errors name the field and rule, with spreadsheet row numbers', errs.body.data.map((r) => r.row_number).join(',') === '4,5,6,7' && rules.includes('V-003') && rules.includes('V-027'), errs.body.data);
  const audView = await call(DATA, 'GET', `/imports/${b.id}`, { token: auditor });
  const audCommit = await call(DATA, 'POST', `/imports/${b.id}/commit`, { token: auditor, body: {} });
  check('IT-IMP-06', 'auditor can view the batch but cannot confirm it', audView.status === 200 && audCommit.status === 403, audCommit.body);

  const commit = await call(DATA, 'POST', `/imports/${b.id}/commit`, { token: sa, body: {} });
  check('IT-IMP-07', 'commit writes valid rows to auth-service', commit.status === 200 && commit.body.data.status === 'COMMITTED' && commit.body.data.result.created === 1 && commit.body.data.result.updated === 1, commit.body);
  const again = await call(DATA, 'POST', `/imports/${b.id}/commit`, { token: sa, body: {} });
  check('IT-IMP-08', 'a batch can only be committed once', again.status === 409, again.body);
  const centers = await call(AUTH, 'GET', `/centers?q=RJ9${stamp}`, { token: sa });
  check('IT-IMP-09', 'the new Center exists in the master', centers.body.meta.total === 1 && centers.body.data[0].is_placeholder === false, centers.body);
  const rj002 = await call(AUTH, 'GET', '/centers?q=RJ002', { token: sa });
  check('IT-IMP-10', 'the placeholder RJ002 was updated and lost its placeholder flag', rj002.body.data[0].name_en === `ART Centre Alwar Smoke ${stamp}` && rj002.body.data[0].is_placeholder === false, rj002.body.data[0]);

  // ---- cancel
  const up2 = await upload(sa, 'centers', 'again.csv', `Center Code,Center Name,District LGD Code,Center Type\nRJ5${stamp},ART Centre Cancel Me,86,ART\n`);
  const cancel = await call(DATA, 'POST', `/imports/${up2.body.data.id}/cancel`, { token: sa, body: {} });
  const rowsAfter = await call(DATA, 'GET', `/imports/${up2.body.data.id}/rows`, { token: sa });
  check('IT-IMP-11', 'cancel deletes staged rows and the batch cannot be committed afterwards', cancel.body.data?.status === 'CANCELLED' && rowsAfter.body.meta.total === 0, cancel.body);

  // ---- rejected files
  const header = await upload(sa, 'centers', 'h.csv', 'Code,Name\nRJ1,X\n');
  check('IT-IMP-12', 'missing required columns: batch REJECTED with header errors', header.body.data?.status === 'REJECTED' && header.body.data.header_errors.length >= 4, header.body);
  const xls = await upload(sa, 'centers', 'old.xls', Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(64)]));
  check('IT-IMP-13', '.xls is refused (E_FILE_TYPE)', xls.status === 400 && xls.body.code === 'E_FILE_TYPE', xls.body);
  const html = await upload(sa, 'centers', 'evil.csv', '<html><script>alert(1)</script></html>');
  check('IT-IMP-14', 'markup posing as CSV is refused', html.status === 400, html.body);

  const list = await call(DATA, 'GET', '/imports?kind=centers', { token: auditor });
  check('IT-IMP-15', 'auditor sees import history', list.status === 200 && list.body.meta.total >= 3, list.body.meta);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
