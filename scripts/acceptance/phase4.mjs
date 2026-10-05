#!/usr/bin/env node
/**
 * Phase 4 acceptance: PPO generation, uniqueness, sheet, PDF, correction, manual mode
 * (docs/phases/PHASE_4_PPO.md). Needs Phases 1 to 3.   node scripts/acceptance/phase4.mjs [--allow-todo]
 * Temporarily switches the ppo.assignment_mode setting to MANUAL and back.
 */
import { call, check, finish, login } from '../lib/smoke-kit.mjs';
import { makeApproved, makeSubmitted } from '../lib/flows.mjs';

const w1 = await login('worker.rj001', 'RJ001');
const w2 = await login('worker.rj002', 'RJ002');
const inch = await login('incharge.rj001', 'RJ001');
const verifier = await login('verifier');
const approver = await login('approver');
const superadmin = await login('superadmin');
const auditor = await login('auditor');
const tokens = { worker: w1, incharge: inch, verifier, approver };
const V037 = /^[A-Z0-9/-]{6,40}$/;

// ---- permissions and status
const approved = await makeApproved(tokens);
const wGen = await call('core', 'POST', `/applications/${approved}/ppo`, { token: w1, body: {} });
const vGen = await call('core', 'POST', `/applications/${approved}/ppo`, { token: verifier, body: {} });
check('AT-P4-01', 'worker and verifier cannot generate a PPO (403)', wGen.status === 403 && vGen.status === 403, [wGen.body?.code, vGen.body?.code], wGen);
const submitted = await makeSubmitted({ worker: w1, incharge: inch });
const notYet = await call('core', 'POST', `/applications/${submitted}/ppo`, { token: approver, body: {} });
check('AT-P4-02', 'a PPO only for APPROVED applications (409 E_TRANSITION)', notYet.status === 409, notYet.body, notYet);

// ---- generate
const gen = await call('core', 'POST', `/applications/${approved}/ppo`, { token: approver, body: {} });
const ppo = gen.body?.data;
check('AT-P4-03', 'the approver generates a PPO with a V-037 number in SYSTEM mode', gen.status === 201 && V037.test(ppo?.ppo_number ?? '') && ppo.mode === 'SYSTEM', gen.body, gen);
const app = await call('core', 'GET', `/applications/${approved}`, { token: w1 });
check('AT-P4-04', 'the application is now PPO_GENERATED', app.body?.data?.status === 'PPO_GENERATED', app.body?.data?.status);
const twice = await call('core', 'POST', `/applications/${approved}/ppo`, { token: approver, body: {} });
check('AT-P4-05', 'a second PPO for the same application is refused (409)', twice.status === 409, twice.body);

// ---- uniqueness under concurrency
const ids = [];
for (let i = 0; i < 4; i++) ids.push(await makeApproved(tokens));
const parallel = await Promise.all(ids.map((id) => call('core', 'POST', `/applications/${id}/ppo`, { token: approver, body: {} })));
const numbers = parallel.map((r) => r.body?.data?.ppo_number).filter(Boolean);
check('AT-P4-06', '4 PPOs generated at the same time get 4 different numbers', numbers.length === 4 && new Set([...numbers, ppo?.ppo_number]).size === 5, numbers);

// ---- list, scope, search
if (ppo) {
  const byNo = await call('core', 'GET', `/ppo?q=${encodeURIComponent(ppo.ppo_number.toLowerCase())}`, { token: approver });
  check('AT-P4-07', 'search the PPO list by number (any case)', byNo.body?.meta?.total === 1 && byNo.body.data[0].id === ppo.id, byNo.body?.meta, byNo);
  const own = await call('core', 'GET', `/ppo/${ppo.id}`, { token: w1 });
  const other = await call('core', 'GET', `/ppo/${ppo.id}`, { token: w2 });
  check('AT-P4-08', 'the worker of the Center sees the PPO; another Center gets 404', own.status === 200 && other.status === 404, [own.status, other.status], own);
  const ben = await call('core', 'GET', `/beneficiaries?q=${encodeURIComponent(ppo.ppo_number)}`, { token: approver });
  check('AT-P4-09', 'beneficiary search finds the beneficiary by PPO number and shows it', ben.body?.meta?.total === 1 && ben.body.data[0].ppo_number === ppo.ppo_number, ben.body?.data?.[0]);

  // ---- sheet and PDF
  const sheet = await call('core', 'GET', `/ppo/${ppo.id}/sheet`, { token: w1 });
  const s = sheet.body?.data;
  check('AT-P4-10', 'sheet: PPO number, guardian, masked account, draft flag', sheet.status === 200 && s.ppo_number === ppo.ppo_number && s.beneficiary.guardian_name && s.bank.account_masked?.endsWith('9012') && s.draft_format === true, s, sheet);
  const pdf = await call('core', 'GET', `/ppo/${ppo.id}/pdf`, { token: w1 });
  const disp = pdf.headers?.get?.('content-disposition') ?? '';
  check('AT-P4-11', 'PDF downloads as an attachment named by id, not by number or name', pdf.status === 200 && Buffer.isBuffer(pdf.body) && pdf.body.subarray(0, 5).toString() === '%PDF-' && disp.startsWith('attachment') && disp.includes(ppo.id), [pdf.status, disp], pdf);

  // ---- correction (Super Admin only)
  const apCorr = await call('core', 'POST', `/ppo/${ppo.id}/correct`, { token: approver, body: { field: 'monthly_amount', value: '1500', reason: 'Amount fixed by the department order' } });
  check('AT-P4-12', 'the approver cannot correct a PPO (403)', apCorr.status === 403, apCorr.body, apCorr);
  const noReason = await call('core', 'POST', `/ppo/${ppo.id}/correct`, { token: superadmin, body: { field: 'monthly_amount', value: '1500' } });
  const corr = await call('core', 'POST', `/ppo/${ppo.id}/correct`, { token: superadmin, body: { field: 'monthly_amount', value: '1500', reason: 'Amount fixed by the department order' } });
  check('AT-P4-13', 'Super Admin corrects with a reason (and not without)', noReason.status === 422 && corr.status === 200 && Number(corr.body.data.monthly_amount) === 1500 && corr.body.data.corrections.length >= 1, corr.body, corr);
  const aud = await call('auth', 'GET', `/audit?action=core.ppo.corrected&entity_id=${ppo.id}`, { token: auditor });
  check('AT-P4-14', 'the correction is audited', aud.body?.meta?.total >= 1, aud.body?.meta);
}

// ---- manual mode
const setMode = (value) => call('core', 'PUT', '/settings/ppo.assignment_mode', { token: superadmin, body: { value } });
const m = await setMode('MANUAL');
if (m.status === 200) {
  try {
    const id = await makeApproved(tokens);
    const noNumber = await call('core', 'POST', `/applications/${id}/ppo`, { token: superadmin, body: {} });
    const apManual = await call('core', 'POST', `/applications/${id}/ppo`, { token: approver, body: { ppo_number: 'RJ/MANUAL/000001' } });
    const number = `RJ/MANUAL/${Date.now().toString().slice(-8)}`;
    const manual = await call('core', 'POST', `/applications/${id}/ppo`, { token: superadmin, body: { ppo_number: number } });
    check('AT-P4-15', 'MANUAL mode: the number is required, needs PPO_RECORD_MANUAL_ASSIGN, and is stored as typed', noNumber.status === 422 && apManual.status === 403 && manual.status === 201 && manual.body.data.ppo_number === number && manual.body.data.mode === 'MANUAL', [noNumber.status, apManual.status, manual.body], manual);
  } finally {
    await setMode('SYSTEM');
  }
} else check('AT-P4-15', 'switch ppo.assignment_mode to MANUAL as Super Admin', false, m.body, m);

finish();
