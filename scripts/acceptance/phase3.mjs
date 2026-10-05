#!/usr/bin/env node
/**
 * Phase 3 acceptance: verification, approval, maker-checker (docs/phases/PHASE_3_VERIFICATION.md).
 * Needs Phases 1 and 2.   node scripts/acceptance/phase3.mjs [--allow-todo]
 */
import { call, check, finish, guardChecks, login } from '../lib/smoke-kit.mjs';
import { ALL_OK, createDraft, getApp, makeSubmitted, transition } from '../lib/flows.mjs';

const w1 = await login('worker.rj001', 'RJ001');
const inch = await login('incharge.rj001', 'RJ001');
const verifier = await login('verifier');
const approver = await login('approver');
const superadmin = await login('superadmin');
const auditor = await login('auditor');

const id = await makeSubmitted({ worker: w1, incharge: inch });

// ---- queues and pick
await guardChecks('AT-P3-01', 'GET /queues/verification', { svc: 'core', method: 'GET', path: '/queues/verification', allowed: verifier, forbidden: w1 });
const q = await call('core', 'GET', '/queues/verification?view=unassigned&limit=100', { token: verifier });
check('AT-P3-02', 'the submitted application is in the unassigned queue', q.body?.data?.some((a) => a.id === id), q.body?.meta, q);
const apPick = await transition(approver, id, 'pick');
check('AT-P3-03', 'an approver cannot pick (403)', apPick.status === 403, apPick.body);
const pick = await transition(verifier, id, 'pick');
check('AT-P3-04', 'the verifier picks it (UNDER_VERIFICATION)', pick.body?.data?.status === 'UNDER_VERIFICATION', pick.body);
const steal = await transition(superadmin, id, 'pick');
check('AT-P3-05', 'another verifier cannot take a fresh item (409 E_TRANSITION)', steal.status === 409, steal.body);
const mine = await call('core', 'GET', '/queues/verification?view=mine', { token: verifier });
check('AT-P3-06', 'it moves to the verifier\'s "mine" view', mine.body?.data?.some((a) => a.id === id), mine.body?.meta);

// ---- checklist, compare, unmask
const early = await transition(verifier, id, 'recommend', { recommendation: 'APPROVE' });
check('AT-P3-07', 'recommend without a checklist is 422 E_CHECKLIST_INCOMPLETE', early.status === 422 && early.body.code === 'E_CHECKLIST_INCOMPLETE', early.body);
const partial = await call('core', 'PUT', `/applications/${id}/review`, { token: verifier, body: { checklist: { identity: 'OK' } } });
check('AT-P3-08', 'a checklist missing items is refused (422)', partial.status === 422, partial.body, partial);
const issue = await call('core', 'PUT', `/applications/${id}/review`, { token: verifier, body: { checklist: { ...ALL_OK, bank: 'ISSUE' }, remarks: 'IFSC does not match the passbook' } });
const issueRec = await transition(verifier, id, 'recommend', { recommendation: 'APPROVE' });
check('AT-P3-09', 'with an ISSUE item, recommending APPROVE is 422 E_CHECKLIST_ISSUES', issue.status === 200 && issueRec.status === 422 && issueRec.body.code === 'E_CHECKLIST_ISSUES', issueRec.body);
const otherReview = await call('core', 'PUT', `/applications/${id}/review`, { token: superadmin, body: { checklist: ALL_OK } });
check('AT-P3-10', 'only the picker can fill the checklist (403 E_NOT_YOUR_ITEM)', otherReview.status === 403 && otherReview.body.code === 'E_NOT_YOUR_ITEM', otherReview.body);
await call('core', 'PUT', `/applications/${id}/review`, { token: verifier, body: { checklist: ALL_OK } });
const cmp = await call('core', 'GET', `/applications/${id}/compare`, { token: verifier });
check('AT-P3-11', 'compare returns masked SOCH vs entered rows with a match flag', cmp.status === 200 && cmp.body.data.rows.some((r) => r.field === 'aadhaar' && 'match' in r), cmp.body, cmp);
const un = await call('core', 'POST', `/applications/${id}/unmask`, { token: verifier, body: { fields: ['jan_aadhaar', 'bank_account_number'] } });
check('AT-P3-12', 'the verifier reveals Jan Aadhaar and account number', un.status === 200 && un.body.data.jan_aadhaar === '1234567890' && un.body.data.bank_account_number === '123456789012', un.body, un);
const unW = await call('core', 'POST', `/applications/${id}/unmask`, { token: w1, body: { fields: ['jan_aadhaar'] } });
check('AT-P3-13', 'the worker cannot use unmask (403)', unW.status === 403, unW.body, unW);

// ---- recommend, approve
const rec = await transition(verifier, id, 'recommend', { recommendation: 'APPROVE' });
check('AT-P3-14', 'recommend APPROVE (RECOMMENDED)', rec.body?.data?.status === 'RECOMMENDED', rec.body);
const aq = await call('core', 'GET', '/queues/approval?limit=100', { token: approver });
check('AT-P3-15', 'it is in the approval queue with the recommendation', aq.body?.data?.some((a) => a.id === id && a.recommendation === 'APPROVE'), aq.body?.meta, aq);
const vApprove = await transition(verifier, id, 'approve');
check('AT-P3-16', 'the verifier cannot approve (403)', vApprove.status === 403, vApprove.body);
const ok = await transition(approver, id, 'approve');
check('AT-P3-17', 'the approver approves (APPROVED)', ok.body?.data?.status === 'APPROVED', ok.body);

// ---- maker-checker with one person holding both permissions (Super Admin)
const id2 = await makeSubmitted({ worker: w1, incharge: inch });
await transition(superadmin, id2, 'pick');
await call('core', 'PUT', `/applications/${id2}/review`, { token: superadmin, body: { checklist: ALL_OK } });
const rec2 = await transition(superadmin, id2, 'recommend', { recommendation: 'REJECT', reason: 'Not eligible as per the scheme rules' });
const self = await transition(superadmin, id2, 'approve');
check('AT-P3-18', 'the person who recommended cannot decide it (403 E_MAKER_CHECKER)', rec2.body?.data?.status === 'RECOMMENDED' && self.status === 403 && self.body.code === 'E_MAKER_CHECKER', self.body);
const rejNo = await transition(approver, id2, 'reject');
check('AT-P3-19', 'reject without a reason is 422', rejNo.status === 422, rejNo.body);
const rej = await transition(approver, id2, 'reject', { reason: 'Not eligible as per the scheme rules' });
check('AT-P3-20', 'the approver rejects with a reason (REJECTED, final)', rej.body?.data?.status === 'REJECTED' && (rej.body.data.allowed_actions ?? []).length === 0, rej.body);
const again = await createDraft(w1, (await getApp(w1, id2)).beneficiary.id).catch((e) => e);
check('AT-P3-21', 'no new application after a rejection (E_PREVIOUSLY_REJECTED, BR-17)', again instanceof Error && again.message.includes('E_PREVIOUSLY_REJECTED'), String(again).slice(0, 200));

// ---- return path from verification
const id3 = await makeSubmitted({ worker: w1, incharge: inch });
await transition(verifier, id3, 'pick');
const back = await transition(verifier, id3, 'return', { reason: 'Jan Aadhaar does not match the ration card' });
check('AT-P3-22', 'the verifier returns an application to the Center (RETURNED)', back.body?.data?.status === 'RETURNED', back.body);

const aud = await call('auth', 'GET', `/audit?action=core.beneficiary.pii_unmasked&entity_id=${id}`, { token: auditor });
check('AT-P3-23', 'the application unmask is audited', aud.body?.meta?.total >= 1, aud.body?.meta);

finish();
