/**
 * Business flows built ONLY from the documented API contracts (docs/phases/*.md), used by the acceptance
 * scripts to reach a starting state: "an application waiting for verification", "an approved
 * application", and so on. If a flow throws, the phase it depends on is not done yet.
 */
import { call } from './smoke-kit.mjs';

/** Synthetic, checksum-valid test values (local database only, R-PII-7). */
export const VALID_FORM = {
  guardian_name: 'Ramesh Kumar',
  category: 'OBC',
  jan_aadhaar: '1234567890',
  aadhaar_for_bank: '234123412346',
  bank_name: 'State Bank of India',
  bank_account_number: '123456789012',
  ifsc: 'SBIN0001234',
  consent: 'YES',
  consent_language: 'hi',
};

const need = (r, what) => {
  if (r.status < 200 || r.status >= 300) throw new Error(`${what} failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body.data;
};

/** A beneficiary in the caller's scope with no active application and not deceased. */
export const freeBeneficiary = async (token) => {
  const r = need(await call('core', 'GET', '/beneficiaries?has_application=false&limit=100', { token }), 'list free beneficiaries');
  const b = r.find((x) => !x.application && x.art_status !== 'DIED');
  if (!b) throw new Error('no free beneficiary in this scope: import fixtures/soch-sample.xlsx again or reset the DB');
  return b;
};

export const getApp = async (token, id) => need(await call('core', 'GET', `/applications/${id}`, { token }), 'get application');

export const createDraft = async (token, beneficiaryId) =>
  need(await call('core', 'POST', '/applications', { token, body: { beneficiary_id: beneficiaryId } }), 'create draft');

export const patchApp = async (token, id, fields) => {
  const app = await getApp(token, id);
  return call('core', 'PATCH', `/applications/${id}`, { token, body: { version: app.version, ...fields } });
};

export const transition = async (token, id, action, extra = {}) => {
  const app = await getApp(token, id);
  return call('core', 'POST', `/applications/${id}/transitions`, { token, body: { action, version: app.version, ...extra } });
};

/** DRAFT -> filled -> PENDING_SIGNOFF -> SUBMITTED (Phase 2). Returns the application id. */
export const makeSubmitted = async ({ worker, incharge }) => {
  const b = await freeBeneficiary(worker);
  const app = await createDraft(worker, b.id);
  need(await patchApp(worker, app.id, VALID_FORM), 'fill form');
  const s = need(await transition(worker, app.id, 'submit'), 'submit');
  if (s.status === 'PENDING_SIGNOFF') need(await transition(incharge, app.id, 'signoff'), 'signoff');
  return app.id;
};

/** ... -> UNDER_VERIFICATION -> RECOMMENDED (APPROVE) -> APPROVED (Phase 3). */
export const makeApproved = async ({ worker, incharge, verifier, approver }) => {
  const id = await makeSubmitted({ worker, incharge });
  need(await transition(verifier, id, 'pick'), 'pick');
  need(await call('core', 'PUT', `/applications/${id}/review`, { token: verifier, body: { checklist: ALL_OK } }), 'review');
  need(await transition(verifier, id, 'recommend', { recommendation: 'APPROVE' }), 'recommend');
  need(await transition(approver, id, 'approve'), 'approve');
  return id;
};

export const ALL_OK = { identity: 'OK', aadhaar: 'OK', jan_aadhaar: 'OK', bank: 'OK', consent: 'OK', completeness: 'OK' };

/** ... -> PPO_GENERATED (Phase 4). Returns { applicationId, ppo }. */
export const makePpo = async (tokens) => {
  const id = await makeApproved(tokens);
  const ppo = need(await call('core', 'POST', `/applications/${id}/ppo`, { token: tokens.approver, body: {} }), 'generate PPO');
  return { applicationId: id, ppo };
};
