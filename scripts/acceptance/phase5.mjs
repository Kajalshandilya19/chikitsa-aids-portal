#!/usr/bin/env node
/**
 * Phase 5 acceptance: payments, payment import, dashboard v2, reports, search, exports
 * (docs/phases/PHASE_5_PAYMENTS_REPORTS.md). Needs Phases 1 to 4.
 *   node scripts/acceptance/phase5.mjs [--allow-todo]
 */
import { call, check, finish, guardChecks, login, upload } from '../lib/smoke-kit.mjs';
import { makePpo } from '../lib/flows.mjs';

const w1 = await login('worker.rj001', 'RJ001');
const w2 = await login('worker.rj002', 'RJ002');
const inch = await login('incharge.rj001', 'RJ001');
const verifier = await login('verifier');
const approver = await login('approver');
const sa = await login('stateadmin');
const superadmin = await login('superadmin');
const dist = await login('dapcu.ajmer');
const auditor = await login('auditor');

const { ppo } = await makePpo({ worker: w1, incharge: inch, verifier, approver });
const period = '2026-01'; // every run uses a fresh PPO, so a fixed period never collides

// ---- payments
const wPay = await call('core', 'POST', '/payments', { token: w1, body: { ppo_id: ppo.id, period, amount: 1500, status: 'PAID' } });
check('AT-P5-01', 'a worker cannot record payments (403)', wPay.status === 403, wPay.body, wPay);
const pay = await call('core', 'POST', '/payments', { token: approver, body: { ppo_id: ppo.id, period, payment_date: '2026-01-05', amount: 1500, status: 'PAID' } });
check('AT-P5-02', 'the approver records a payment (201)', pay.status === 201 && pay.body.data.source === 'MANUAL', pay.body, pay);
const dup = await call('core', 'POST', '/payments', { token: approver, body: { ppo_id: ppo.id, period, amount: 1500, status: 'PAID' } });
check('AT-P5-03', 'a second payment for the same period is refused (409 E_DUPLICATE_PAYMENT)', dup.status === 409 && dup.body.code === 'E_DUPLICATE_PAYMENT', dup.body, dup);
const badAmount = await call('core', 'POST', '/payments', { token: approver, body: { ppo_id: ppo.id, period: '2026-13', amount: 0, status: 'PAID' } });
check('AT-P5-04', 'bad period and amount are refused (422, V-034, V-033)', badAmount.status === 422, badAmount.body, badAmount);
if (pay.status === 201) {
  const rev = await call('core', 'PATCH', `/payments/${pay.body.data.id}`, { token: approver, body: { status: 'REVERSED', remarks: 'Bank returned the transfer' } });
  const afterRev = await call('core', 'PATCH', `/payments/${pay.body.data.id}`, { token: approver, body: { amount: 10 } });
  check('AT-P5-05', 'a reversed payment cannot be edited (409 E_NOT_EDITABLE)', rev.status === 200 && afterRev.status === 409, afterRev.body, afterRev);
}
const listOwn = await call('core', 'GET', `/payments?ppo_id=${ppo.id}`, { token: w1 });
const listOther = await call('core', 'GET', `/payments?ppo_id=${ppo.id}`, { token: w2 });
check('AT-P5-06', 'payments are visible to the Center worker and not to another Center (0 rows)', listOwn.body?.meta?.total >= 1 && listOther.body?.meta?.total === 0, [listOwn.body?.meta, listOther.body?.meta], listOwn);

// ---- payment import
const csv = `PPO Number,Payment Period,Payment Date,Amount,Status,Remarks\n${ppo.ppo_number},${period},05-02-2026,1500,PAID,\nRJ/NOPE/999999,${period},,1500,PAID,\n`;
const imp = await upload('data', '/imports/payments', approver, 'payments.csv', csv);
check('AT-P5-07', 'payment import: 1 valid, 1 unknown PPO error', imp.status === 201 && imp.body.data.valid_count === 1 && imp.body.data.error_count === 1, imp.body?.data ?? imp.body);
if (imp.status === 201) {
  const c = await call('data', 'POST', `/imports/${imp.body.data.id}/commit`, { token: approver, body: {} });
  const after = await call('core', 'GET', `/payments?ppo_id=${ppo.id}&status=PAID`, { token: approver });
  check('AT-P5-08', 'committed imported payment appears with source IMPORT', c.status === 200 && after.body?.data?.some((p) => p.source === 'IMPORT'), after.body?.data);
}

// ---- dashboard
const dsS = await call('core', 'GET', '/dashboard/summary', { token: sa });
const dsW = await call('core', 'GET', '/dashboard/summary', { token: w1 });
const dsD = await call('core', 'GET', '/dashboard/summary', { token: dist });
check('AT-P5-09', 'state dashboard has district and center breakdowns and payment activity', Array.isArray(dsS.body?.data?.by_district) && Array.isArray(dsS.body.data.by_center) && 'active' in (dsS.body.data.payments ?? {}), dsS.body?.data && Object.keys(dsS.body.data));
check('AT-P5-10', 'district dashboard: no district table, Center table only for its district; worker: neither', dsD.body?.data?.by_district === null && Array.isArray(dsD.body.data.by_center) && dsW.body?.data?.by_center === null, [dsD.body?.data?.by_district, dsW.body?.data?.by_center]);

// ---- reports and search
await guardChecks('AT-P5-11', 'GET /reports/beneficiaries', { svc: 'core', method: 'GET', path: '/reports/beneficiaries', allowed: sa });
const rep = await call('core', 'GET', '/reports/beneficiaries?limit=100', { token: dist });
check('AT-P5-12', 'reports respect scope (district officer: Ajmer only)', rep.status === 200 && rep.body.data.every((r) => r.district.name_en === 'Ajmer'), rep.body?.meta, rep);
const perf = await call('core', 'GET', '/reports/center_performance?limit=100', { token: sa });
check('AT-P5-13', 'center performance report lists Centers with counts', perf.status === 200 && perf.body.data.some((r) => r.center.code === 'RJ001' && r.ppo >= 1), perf.body?.meta, perf);
const badFilter = await call('core', 'GET', '/reports/beneficiaries?colour=red', { token: sa });
check('AT-P5-14', 'unknown report filters are refused (422)', badFilter.status === 422, badFilter.body, badFilter);
const sPpo = await call('core', 'GET', `/search?q=${encodeURIComponent(ppo.ppo_number)}`, { token: sa });
check('AT-P5-15', 'global search finds the PPO', sPpo.body?.data?.ppo?.some((p) => p.id === ppo.id), sPpo.body?.data, sPpo);
const sJan = await call('core', 'GET', '/search?q=1234567890', { token: sa });
check('AT-P5-16', 'global search by Jan Aadhaar finds applications', (sJan.body?.data?.applications?.length ?? 0) >= 1, sJan.body?.data);
const sOther = await call('core', 'GET', `/search?q=${encodeURIComponent(ppo.ppo_number)}`, { token: w2 });
check('AT-P5-17', 'search is scoped (another Center finds nothing)', sOther.status === 200 && sOther.body.data.ppo.length === 0, sOther.body?.data);

// ---- exports
const body = { report: 'applications', format: 'csv', filters: {}, sensitive: false };
const wExp = await call('data', 'POST', '/exports', { token: w1, body });
check('AT-P5-18', 'workers cannot export (403)', wExp.status === 403, wExp.body, wExp);
const csvExp = await call('data', 'POST', '/exports', { token: sa, body });
const csvText = Buffer.isBuffer(csvExp.body) ? csvExp.body.toString('utf8') : '';
check('AT-P5-19', 'masked CSV export: attachment, BOM, no full Aadhaar or Jan Aadhaar', csvExp.status === 200 && csvText.startsWith('﻿') && !csvText.includes('234123412346') && !csvText.includes('1234567890') && (csvExp.headers.get('content-disposition') ?? '').startsWith('attachment'), csvExp.status, csvExp);
const xlsx = await call('data', 'POST', '/exports', { token: sa, body: { ...body, format: 'xlsx' } });
check('AT-P5-20', 'xlsx export is a real workbook (zip bytes)', xlsx.status === 200 && Buffer.isBuffer(xlsx.body) && xlsx.body.readUInt32LE(0) === 0x04034b50, xlsx.status, xlsx);
const saSens = await call('data', 'POST', '/exports', { token: sa, body: { ...body, sensitive: true } });
check('AT-P5-21', 'state admin cannot export full identifiers (403)', saSens.status === 403, saSens.body, saSens);
const suSens = await call('data', 'POST', '/exports', { token: superadmin, body: { ...body, sensitive: true } });
check('AT-P5-22', 'super admin sensitive export contains the full Jan Aadhaar', suSens.status === 200 && suSens.body.toString('utf8').includes('1234567890'), suSens.status, suSens);
const aud = await call('auth', 'GET', '/audit?action=data.export.created&limit=5', { token: auditor });
check('AT-P5-23', 'exports are audited with format and sensitivity', aud.body?.meta?.total >= 3 && aud.body.data.some((e) => e.data?.sensitive === true), aud.body?.meta);

finish();
