#!/usr/bin/env node
/**
 * Demo data for a LOCAL walkthrough of what is built (Phase 0), created through the real APIs so it
 * passes the same validation, permissions and audit as a person would:
 *   - Link ART Centres RJ042..RJ049 added by a committed Center import (with SOCH facility codes)
 *   - a second import left waiting for confirmation with row errors, and one rejected file
 *   - District Officers for 5 districts, a worker and an in-charge for RJ003..RJ012,
 *     extra State users (verifier, approver, auditor)
 *   - one deactivated and one locked account, so the Users screen (Phase 0b) shows every state
 *
 *   scripts/dev.sh seed && node scripts/seed-demo.mjs        (idempotent: existing users are skipped)
 *
 * Every name and mobile number is fictitious (mobiles in the unissued 90000 0xxxx range).
 * Beneficiaries, applications, PPOs and payments do not exist yet: they are Phases 1 to 5.
 */
import { call, login, upload } from './lib/smoke-kit.mjs';

const su = await login('superadmin');
const sa = await login('stateadmin');
const out = { centers: 0, users: 0, skipped: 0 };

const need = (r, what) => {
  if (r.status >= 300) throw new Error(`${what}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.data;
};

// ---------------------------------------------------------------- Centers via the import pipeline
const districts = need(await call('auth', 'GET', '/districts', { token: sa }), 'districts');
const lgd = (name) => districts.find((d) => d.name_en === name)?.lgd_code;
const lacs = [
  ['RJ042', 'Link ART Centre, Kishangarh', 'लिंक एआरटी केंद्र, किशनगढ़', 'Ajmer'],
  ['RJ043', 'Link ART Centre, Beawar City', 'लिंक एआरटी केंद्र, ब्यावर शहर', 'Beawar'],
  ['RJ044', 'Link ART Centre, Chomu', 'लिंक एआरटी केंद्र, चौमूं', 'Jaipur'],
  ['RJ045', 'Link ART Centre, Phalodi Town', 'लिंक एआरटी केंद्र, फलोदी नगर', 'Phalodi'],
  ['RJ046', 'Link ART Centre, Nathdwara', 'लिंक एआरटी केंद्र, नाथद्वारा', 'Rajsamand'],
  ['RJ047', 'Link ART Centre, Ramganj Mandi', 'लिंक एआरटी केंद्र, रामगंज मंडी', 'Kota'],
  ['RJ048', 'Link ART Centre, Nokha', 'लिंक एआरटी केंद्र, नोखा', 'Bikaner'],
  ['RJ049', 'Link ART Centre, Sumerpur', 'लिंक एआरटी केंद्र, सुमेरपुर', 'Pali'],
];
const header = 'Center Code,Center Name,Center Name (Hindi),District LGD Code,Center Type,SOCH Facility Code';
const good = [header, ...lacs.map(([c, n, h, d], i) => `${c},"${n}","${h}",${lgd(d)},LAC,LAC${String(i + 1).padStart(3, '0')}`)].join('\n');
const b1 = need(await upload('data', '/imports/centers', sa, 'rsacs-link-art-centres.csv', good), 'center import');
if (b1.create_count > 0) {
  const c = need(await call('data', 'POST', `/imports/${b1.id}/commit`, { token: sa, body: {} }), 'commit');
  out.centers = c.result?.created ?? 0;
} else {
  await call('data', 'POST', `/imports/${b1.id}/cancel`, { token: sa, body: {} });
}
// A batch left for review, with typical mistakes, so the preview and row errors can be seen.
const pending = [
  header,
  'RJ050,"Link ART Centre, Bari",लिंक एआरटी केंद्र बारी,98,LAC,LAC050',
  'R5,"Bad Code Centre",,98,LAC,',
  'RJ051,"Unknown District Centre",,99999,ART,',
  'RJ052,"Wrong Type Centre",,116,PHC,',
  'RJ050,"Duplicate Of Bari",,98,LAC,',
].join('\n');
const waiting = need(await call('data', 'GET', '/imports?status=VALIDATED', { token: sa }), 'imports');
if (waiting.length === 0) {
  await upload('data', '/imports/centers', sa, 'district-office-list-draft.csv', pending);
  await upload('data', '/imports/centers', sa, 'old-format.csv', 'Code,Name\nX1,Something\n');
}

// ---------------------------------------------------------------- users
const roles = need(await call('auth', 'GET', '/roles', { token: su }), 'roles');
const roleId = (code) => roles.find((r) => r.code === code).id;
const centers = need(await call('auth', 'GET', '/centers?limit=100', { token: sa }), 'centers');
const centerId = (code) => centers.find((c) => c.code === code)?.id;
const districtId = (name) => districts.find((d) => d.name_en === name)?.id;

let mobile = 9000010000;
const users = [];
const add = (user_code, full_name, role, place) => users.push({ user_code, full_name, role, place });
add('verifier.meena', 'Sunita Meena', 'state_verifier', {});
add('approver.sharma', 'Rakesh Sharma', 'state_approver', {});
add('auditor.joshi', 'Pooja Joshi', 'auditor', {});
for (const [d, first, last] of [
  ['Jaipur', 'Mahesh', 'Saini'],
  ['Jodhpur', 'Kavita', 'Bishnoi'],
  ['Udaipur', 'Dinesh', 'Rawat'],
  ['Kota', 'Rekha', 'Hada'],
  ['Bikaner', 'Gopal', 'Choudhary'],
]) add(`dapcu.${d.toLowerCase()}`, `${first} ${last}`, 'district_officer', { district_id: districtId(d) });
const workers = ['Asha Kanwar', 'Geeta Devi', 'Laxmi Prajapat', 'Santosh Bairwa', 'Radha Gurjar', 'Kamla Regar', 'Meena Kumawat', 'Sarita Jat', 'Pushpa Yadav', 'Neha Khatri'];
const doctors = ['Dr Anil Mathur', 'Dr Seema Agarwal', 'Dr Vikram Rathore', 'Dr Nidhi Purohit', 'Dr Sanjay Tak', 'Dr Ritu Bhati', 'Dr Hemant Vyas', 'Dr Anjali Dadhich', 'Dr Pradeep Swami', 'Dr Kiran Solanki'];
for (let i = 0; i < 10; i++) {
  const code = `RJ${String(i + 3).padStart(3, '0')}`;
  add(`worker.${code.toLowerCase()}`, workers[i], 'center_worker', { center_id: centerId(code) });
  add(`incharge.${code.toLowerCase()}`, doctors[i].replace(/^Dr /, ''), 'center_incharge', { center_id: centerId(code) });
}

const existing = new Set(need(await call('auth', 'GET', '/users?limit=100', { token: su }), 'users').map((u) => u.user_code));
const created = {};
for (const u of users) {
  mobile++;
  if (existing.has(u.user_code)) {
    out.skipped++;
    continue;
  }
  const token = u.role.startsWith('state') || u.role === 'auditor' ? su : sa;
  const r = await call('auth', 'POST', '/users', {
    token,
    body: { user_code: u.user_code, full_name: u.full_name, mobile: String(mobile), assignment: { role_id: roleId(u.role), ...u.place } },
  });
  if (r.status === 201) {
    created[u.user_code] = r.body.data.user.id;
    out.users++;
  } else console.log(`  could not create ${u.user_code}: ${r.body?.code} ${r.body?.message}`);
}

// One deactivated and one locked account.
if (created['worker.rj012']) await call('auth', 'POST', `/users/${created['worker.rj012']}/deactivate`, { token: sa, body: {} });
if (created['worker.rj011']) {
  for (let i = 0; i < Number(process.env.PASSWORD_MAX_FAILED ?? 5); i++) {
    const c = (await call('auth', 'GET', '/captcha')).body.data;
    await call('auth', 'POST', '/auth/login', { body: { center_code: 'RJ011', user_code: 'worker.rj011', password: 'Wrong@Password1', captcha_token: c.token, captcha_answer: c.dev_answer } });
  }
}

console.log(`demo data: ${out.centers} Link ART Centres imported, ${out.users} users created (${out.skipped} already there), 1 import waiting for confirmation, 1 rejected file`);
console.log('logins: docs/DEMO_LOGINS.md; scripts/dev.sh creds --reset prints temporary passwords for the new users (first login asks for a new one, OTP in .logs/auth.log).');
