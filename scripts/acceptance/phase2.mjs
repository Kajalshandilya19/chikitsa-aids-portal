#!/usr/bin/env node
/**
 * Phase 2 acceptance: pension application, consent, worker and in-charge workflow
 * (docs/phases/PHASE_2_APPLICATION.md). Needs Phase 1 (beneficiaries imported).
 *   node scripts/acceptance/phase2.mjs [--allow-todo]
 */
import { call, check, finish, guardChecks, login, skip, upload } from '../lib/smoke-kit.mjs';
import { VALID_FORM, freeBeneficiary, getApp, patchApp, transition } from '../lib/flows.mjs';

const w1 = await login('worker.rj001', 'RJ001');
const w2 = await login('worker.rj002', 'RJ002');
const inch = await login('incharge.rj001', 'RJ001');
const auditor = await login('auditor');
const sa = await login('stateadmin');

let ben;
try {
  ben = await freeBeneficiary(w1);
} catch (e) {
  skip('AT-P2-*', 'all Phase 2 checks', `no free beneficiary (${e.message.slice(0, 80)}); finish Phase 1 first`);
  finish();
}

const created = await call('core', 'POST', '/applications', { token: w1, body: { beneficiary_id: ben.id } });
check('AT-P2-01', 'worker starts a draft (201, DRAFT, version 1)', created.status === 201 && created.body.data.status === 'DRAFT' && created.body.data.version === 1, created.body, created);
if (created.status !== 201) {
  skip('AT-P2-02..', 'the rest of Phase 2', 'POST /applications not working');
  finish();
}
const id = created.body.data.id;

const dup = await call('core', 'POST', '/applications', { token: w1, body: { beneficiary_id: ben.id } });
check('AT-P2-02', 'a second active application for the same beneficiary is refused (409 E_ACTIVE_APPLICATION_EXISTS)', dup.status === 409 && dup.body.code === 'E_ACTIVE_APPLICATION_EXISTS', dup.body);
const peek = await call('core', 'GET', `/applications/${id}`, { token: w2 });
check('AT-P2-03', 'a worker of another Center gets 404', peek.status === 404, peek.body);
const incharge403 = await call('core', 'POST', '/applications', { token: inch, body: { beneficiary_id: ben.id } });
check('AT-P2-04', 'the in-charge cannot start applications (403)', incharge403.status === 403, incharge403.body);

// ---- validation and read-only SOCH fields
const early = await transition(w1, id, 'submit');
check('AT-P2-05', 'submitting an empty draft is 422 E_INCOMPLETE listing the missing fields', early.status === 422 && early.body.code === 'E_INCOMPLETE' && early.body.details?.missing?.includes('bank_account_number'), early.body);
const badAadhaar = await patchApp(w1, id, { aadhaar_for_bank: '234123412345' });
check('AT-P2-06', 'an Aadhaar with a wrong check digit is refused (422, V-007)', badAadhaar.status === 422 && JSON.stringify(badAadhaar.body).includes('V-007'), badAadhaar.body);
const soch = await patchApp(w1, id, { patient_name: 'Someone Else' });
check('AT-P2-07', 'SOCH fields cannot be sent (422 unknown key)', soch.status === 422, soch.body);

// ---- consent document while still a draft
const html = await upload('core', `/applications/${id}/consent-document`, w1, 'consent.pdf', '<html><script>alert(1)</script></html>');
check('AT-P2-08', 'an HTML file named .pdf is refused (400 E_FILE_TYPE)', html.status === 400 && html.body?.code === 'E_FILE_TYPE', html.body, html);
const pdf = await upload('core', `/applications/${id}/consent-document`, w1, 'consent.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
check('AT-P2-09', 'a PDF consent document is accepted', pdf.status === 200 || pdf.status === 201, pdf.body, pdf);
const link = await call('core', 'GET', `/applications/${id}/consent-document`, { token: w1 });
if (link.status === 200) {
  const query = link.body.data.url.split('?')[1];
  const file = await call('core', 'GET', `/files?${query}`);
  check('AT-P2-10', 'the signed link streams the PDF without a login', file.status === 200 && String(file.type).includes('pdf'), file.status);
  const tampered = await call('core', 'GET', `/files?${query.replace(/s=[^&]+/, 's=AAAA')}`);
  check('AT-P2-11', 'a tampered link is refused (403)', tampered.status === 403, tampered.status);
} else check('AT-P2-10', 'consent document link', false, link.body, link);

// ---- fill, masking, stale version, consent
const fill = await patchApp(w1, id, { ...VALID_FORM, consent: 'NO' });
const f = fill.body?.data?.form ?? {};
check('AT-P2-12', 'saved form is masked in the detail (no raw Jan Aadhaar, Aadhaar or account)', fill.status === 200 && f.jan_aadhaar_masked?.endsWith('7890') && f.bank_account_masked?.endsWith('9012') && !('jan_aadhaar' in f) && !('bank_account_number' in f), f);
const edit = await call('core', 'GET', `/applications/${id}/edit`, { token: w1 });
check('AT-P2-13', 'the edit view returns the unmasked values to the worker', edit.status === 200 && edit.body.data.form.jan_aadhaar === '1234567890', edit.status, edit);
const stale = await call('core', 'PATCH', `/applications/${id}`, { token: w1, body: { version: 1, remarks: 'old' } });
check('AT-P2-14', 'an old version is refused (409 E_STALE)', stale.status === 409 && stale.body.code === 'E_STALE', stale.body);
const noConsent = await transition(w1, id, 'submit');
check('AT-P2-15', 'consent NO blocks submission (422 E_CONSENT_REQUIRED)', noConsent.status === 422 && noConsent.body.code === 'E_CONSENT_REQUIRED', noConsent.body);
const yes = await patchApp(w1, id, { consent: 'YES' });
check('AT-P2-16', 'consent YES records the consent text version and time', yes.body?.data?.form?.consent_text_version && yes.body.data.form.consent_captured_at, yes.body?.data?.form);

// ---- submit, sign-off, return, resubmit
const sub = await transition(w1, id, 'submit');
check('AT-P2-17', 'submit moves to PENDING_SIGNOFF', sub.body?.data?.status === 'PENDING_SIGNOFF', sub.body);
const lateEdit = await patchApp(w1, id, { remarks: 'too late' });
check('AT-P2-18', 'no edits after submit (409 E_NOT_EDITABLE)', lateEdit.status === 409 && lateEdit.body.code === 'E_NOT_EDITABLE', lateEdit.body);
const wSign = await transition(w1, id, 'signoff');
check('AT-P2-19', 'the worker cannot sign off (403)', wSign.status === 403, wSign.body);
const noReason = await transition(inch, id, 'return_to_worker');
check('AT-P2-20', 'return without a reason is 422 E_REASON_REQUIRED', noReason.status === 422 && noReason.body.code === 'E_REASON_REQUIRED', noReason.body);
const ret = await transition(inch, id, 'return_to_worker', { reason: 'Bank passbook copy is not readable' });
check('AT-P2-21', 'the in-charge returns it with a reason (RETURNED)', ret.body?.data?.status === 'RETURNED', ret.body);
const fix = await patchApp(w1, id, { remarks: 'Clear passbook copy attached' });
const resub = await transition(w1, id, 'submit');
check('AT-P2-22', 'the worker corrects and resubmits', fix.status === 200 && resub.body?.data?.status === 'PENDING_SIGNOFF', resub.body);
const sign = await transition(inch, id, 'signoff');
check('AT-P2-23', 'the in-charge signs off (SUBMITTED, allowed_actions no longer has signoff)', sign.body?.data?.status === 'SUBMITTED' && !sign.body.data.allowed_actions.includes('signoff'), sign.body?.data);

const hist = await call('core', 'GET', `/applications/${id}/history`, { token: w1 });
const actions = (hist.body?.data ?? []).map((h) => h.action).join(',');
check('AT-P2-24', 'history: create, submit, return_to_worker, submit, signoff (in order, with the reason)', actions === 'create,submit,return_to_worker,submit,signoff' && hist.body.data[2].reason, actions, hist);
const aud = await call('auth', 'GET', `/audit?action=core.application.transition&entity_id=${id}`, { token: auditor });
check('AT-P2-25', 'every transition is audited', aud.body?.meta?.total === 4, aud.body?.meta);

// ---- lists, beneficiary link, dashboard
const list = await call('core', 'GET', '/applications?status=SUBMITTED&limit=100', { token: sa });
check('AT-P2-26', 'state admin sees the submitted application in the list', list.body?.data?.some((a) => a.id === id), list.body?.meta, list);
const bl = await call('core', 'GET', `/beneficiaries/${ben.id}`, { token: w1 });
check('AT-P2-27', 'the beneficiary detail lists the application', bl.body?.data?.applications?.some((a) => a.id === id), bl.body?.data?.applications);
const ds = await call('core', 'GET', '/dashboard/summary', { token: w1 });
check('AT-P2-28', 'dashboard counts submitted applications', (ds.body?.data?.applications?.by_status?.SUBMITTED ?? 0) >= 1, ds.body?.data?.applications);
const final = await getApp(w1, id).catch(() => null);
check('AT-P2-29', 'the worker can still read the submitted application', !!final && final.status === 'SUBMITTED');
await guardChecks('AT-P2-30', 'GET /applications', { svc: 'core', method: 'GET', path: '/applications', allowed: w1 });

finish();
