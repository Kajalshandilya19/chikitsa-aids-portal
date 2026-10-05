#!/usr/bin/env node
/**
 * Phase 1 acceptance: SOCH import and beneficiaries (docs/phases/PHASE_1_SOCH_BENEFICIARIES.md).
 *
 *   scripts/dev.sh up            (or start auth, core, data)
 *   node scripts/acceptance/phase1.mjs              # done when: 0 failed, 0 todo
 *   node scripts/acceptance/phase1.mjs --allow-todo # while building: exit 0 when nothing FAILS
 *
 * Uses fixtures/soch-sample.xlsx (500 valid + 8 error rows). Safe to re-run: the second import of
 * the same file must find every row UNCHANGED. LOCAL database only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, call, check, finish, guardChecks, login, notBuilt, skip, upload } from '../lib/smoke-kit.mjs';

const sa = await login('stateadmin');
const w1 = await login('worker.rj001', 'RJ001');
const w2 = await login('worker.rj002', 'RJ002');
const dist = await login('dapcu.ajmer');
const auditor = await login('auditor');
const verifier = await login('verifier');

// ---------------------------------------------------------------- import
const cols = await call('data', 'GET', '/imports/columns/soch', { token: sa });
check('AT-P1-01', 'GET /imports/columns/soch lists the 20 SOCH columns', cols.status === 200 && cols.body?.data?.length === 20, cols.body, cols);
const headers = cols.status === 200 ? cols.body.data.map((c) => c.header) : [];

const forbiddenUpload = await upload('data', '/imports/soch', w1, 'soch.xlsx', readFileSync(join(ROOT, 'fixtures/soch-sample.xlsx')));
check('AT-P1-02', 'worker cannot upload a SOCH file (403)', forbiddenUpload.status === 403 || forbiddenUpload.status === 404, forbiddenUpload.body);

const up = await upload('data', '/imports/soch', sa, 'soch-sample.xlsx', readFileSync(join(ROOT, 'fixtures/soch-sample.xlsx')));
const b = up.body?.data;
const kindKnown = up.status === 201;
if (!kindKnown) {
  skip('AT-P1-03..06', 'SOCH upload', `upload answered ${up.status} ${up.body?.code ?? ''} (importer "soch" not registered yet?)`);
} else {
  const actions = b.create_count + b.update_count + b.unchanged_count + (b.review_count ?? 0);
  check('AT-P1-03', 'fixture: 500 valid (create+update+unchanged+review), 7 errors, 1 duplicate', b.valid_count === 500 && actions === 500 && b.error_count === 7 && b.duplicate_count === 1, b);
  const errs = await call('data', 'GET', `/imports/${b.id}/rows?status=ERROR&limit=20`, { token: sa });
  const fields = new Set((errs.body?.data ?? []).flatMap((r) => r.errors.map((e) => e.field)));
  const expected = ['art_registration_date', 'last_visit_date', 'facility_code', 'aadhaar', 'patient_name', 'sex', 'age'];
  check('AT-P1-04', 'each error row fails on its own field (date, future date, facility, Aadhaar, name, sex, age)', expected.every((f) => fields.has(f)), [...fields]);
  const commit = await call('data', 'POST', `/imports/${b.id}/commit`, { token: sa, body: {} });
  const r = commit.body?.data?.result ?? {};
  check('AT-P1-05', 'commit: created + updated + unchanged + review_items = 500', commit.status === 200 && (r.created ?? 0) + (r.updated ?? 0) + (r.unchanged ?? 0) + (r.review_items ?? 0) === 500, commit.body);
  const again = await upload('data', '/imports/soch', sa, 'soch-sample.xlsx', readFileSync(join(ROOT, 'fixtures/soch-sample.xlsx')));
  check('AT-P1-06', 're-importing the same file finds every row UNCHANGED (idempotent)', again.body?.data?.unchanged_count === 500, again.body?.data);
  if (again.body?.data?.id) await call('data', 'POST', `/imports/${again.body.data.id}/cancel`, { token: sa, body: {} });
}

// ---------------------------------------------------------------- list, scope, search
const all = await call('core', 'GET', '/beneficiaries?limit=100', { token: sa });
check('AT-P1-07', 'state admin lists at least 500 beneficiaries', all.status === 200 && all.body?.meta?.total >= 500, all.body?.meta, all);
if (!notBuilt(all) && all.status === 200) {
  const row = all.body.data[0];
  check('AT-P1-08', 'list rows carry UID, ART No, name, Center code, and no Aadhaar or contact', row && row.soch_uid && 'center' in row && !('aadhaar' in row) && !('contact_number' in row), row);

  const mine = await call('core', 'GET', '/beneficiaries?limit=100', { token: w1 });
  check('AT-P1-09', 'worker RJ001 sees only RJ001', mine.status === 200 && mine.body.meta.total > 0 && mine.body.data.every((x) => x.center.code === 'RJ001'), mine.body?.meta);

  const other = (await call('core', 'GET', '/beneficiaries?limit=5', { token: w2 })).body?.data?.[0];
  if (other) {
    const peek = await call('core', 'GET', `/beneficiaries/${other.id}`, { token: w1 });
    check('AT-P1-10', 'worker RJ001 opening an RJ002 beneficiary gets 404 (not 403)', peek.status === 404 && !notBuilt(peek), peek.body, peek);
    const filterTry = await call('core', 'GET', `/beneficiaries?center_id=${other.center.id}`, { token: w1 });
    check('AT-P1-11', 'a center_id filter cannot widen a worker scope (0 rows)', filterTry.status === 200 && filterTry.body.meta.total === 0, filterTry.body?.meta);
  } else skip('AT-P1-10..11', 'cross-Center checks', 'worker.rj002 sees no beneficiary');

  const dl = await call('core', 'GET', '/beneficiaries?limit=100', { token: dist });
  check('AT-P1-12', 'district officer (Ajmer) sees only Ajmer', dl.status === 200 && dl.body.meta.total > 0 && dl.body.data.every((x) => x.district.name_en === 'Ajmer'), dl.body?.meta);

  const byUid = await call('core', 'GET', `/beneficiaries?q=${encodeURIComponent(row.soch_uid.toLowerCase())}`, { token: sa });
  check('AT-P1-13', 'search by UID (any case) finds exactly that beneficiary', byUid.body?.meta?.total === 1 && byUid.body.data[0].id === row.id, byUid.body?.meta);
  const word = row.patient_name.split(' ')[0];
  const byName = await call('core', 'GET', `/beneficiaries?q=${encodeURIComponent(word.toLowerCase())}&limit=100`, { token: sa });
  check('AT-P1-14', 'search by a name word finds rows containing that word', byName.body?.meta?.total >= 1 && byName.body.data.every((x) => x.patient_name.toLowerCase().split(' ').includes(word.toLowerCase())), byName.body?.meta);

  // ---------------------------------------------------------------- detail, masking, unmask
  const det = await call('core', 'GET', `/beneficiaries/${row.id}`, { token: sa });
  check('AT-P1-15', 'detail has SOCH fields with masked identifiers only', det.status === 200 && det.body.data.soch_beneficiary_id && 'aadhaar_masked' in det.body.data && !('aadhaar' in det.body.data), det.body?.data, det);
  const unW = await call('core', 'POST', `/beneficiaries/${row.id}/unmask`, { token: w1, body: { fields: ['aadhaar'] } });
  check('AT-P1-16', 'worker cannot unmask (403, or 404 when out of scope)', unW.status === 403 || (unW.status === 404 && !notBuilt(unW)), unW.body, unW);
  const unV = await call('core', 'POST', `/beneficiaries/${row.id}/unmask`, { token: verifier, body: { fields: ['aadhaar', 'contact_number'] } });
  check('AT-P1-17', 'verifier unmasks exactly the requested fields', unV.status === 200 && Object.keys(unV.body.data).sort().join() === 'aadhaar,contact_number', unV.body, unV);
  const aud = await call('auth', 'GET', '/audit?action=core.beneficiary.pii_unmasked&limit=1', { token: auditor });
  check('AT-P1-18', 'every unmask is in the audit log', unV.status !== 200 || aud.body?.meta?.total >= 1, aud.body?.meta);

  // ---------------------------------------------------------------- review items (UID merge)
  if (kindKnown && headers.length === 20 && det.status === 200 && det.body.data.pid_number) {
    const d = det.body.data;
    const values = {
      'Beneficiary ID': `X${Date.now().toString().slice(-7)}`,
      UID: `RJUIDX${Date.now().toString().slice(-6)}`,
      'PID Number': d.pid_number,
      'Patient Name': d.patient_name,
      Sex: d.sex === 'FEMALE' ? 'F' : d.sex === 'MALE' ? 'M' : 'TG',
      'Facility Code': d.center.code,
    };
    const csv = `${headers.join(',')}\n${headers.map((h) => values[h] ?? '').join(',')}\n`;
    const m = await upload('data', '/imports/soch', sa, 'merge.csv', csv);
    check('AT-P1-19', 'a new UID with a known PID is staged as REVIEW, not as a new beneficiary', m.body?.data?.review_count === 1 && m.body.data.create_count === 0, m.body?.data);
    if (m.body?.data?.id) {
      await call('data', 'POST', `/imports/${m.body.data.id}/commit`, { token: sa, body: {} });
      const list = await call('core', 'GET', '/import-review?status=OPEN&limit=100', { token: sa });
      const item = list.body?.data?.find((x) => x.existing?.id === d.id);
      check('AT-P1-20', 'the committed REVIEW row appears in the open review list next to the existing record', !!item, list.body?.meta, list);
      if (item) {
        const res = await call('core', 'POST', `/import-review/${item.id}/resolve`, { token: sa, body: { action: 'IGNORE' } });
        check('AT-P1-21', 'resolve IGNORE closes the item', res.status === 200 && res.body.data.status === 'IGNORED', res.body, res);
      }
    }
  } else skip('AT-P1-19..21', 'review item flow', 'needs the importer, the columns endpoint and a detail with a PID');
  await guardChecks('AT-P1-22', 'GET /import-review', { svc: 'core', method: 'GET', path: '/import-review', allowed: sa, forbidden: w1 });

  // ---------------------------------------------------------------- dashboard
  const ds = await call('core', 'GET', '/dashboard/summary', { token: sa });
  check('AT-P1-23', 'dashboard (state) counts at least 500 beneficiaries', ds.status === 200 && ds.body.data.beneficiaries.total >= 500, ds.body?.data, ds);
  const dw = await call('core', 'GET', '/dashboard/summary', { token: w1 });
  check('AT-P1-24', 'dashboard (worker) equals the worker list total', dw.status === 200 && dw.body.data.beneficiaries.total === mine.body.meta.total && dw.body.data.open_review_items === null, dw.body?.data, dw);
} else {
  skip('AT-P1-08..24', 'beneficiary checks', 'GET /beneficiaries not built');
}
await guardChecks('AT-P1-25', 'GET /beneficiaries', { svc: 'core', method: 'GET', path: '/beneficiaries', allowed: w1 });

finish();
