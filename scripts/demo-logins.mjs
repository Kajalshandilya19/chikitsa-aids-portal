#!/usr/bin/env node
/**
 * Prints who can log in locally, and how (docs/DEMO_LOGINS.md). LOCAL ONLY: smoke-kit refuses to run
 * unless APP_ENV=local.
 *
 *   scripts/dev.sh creds            dev users (one per role) with DEV_USER_PASSWORD from env/local.env
 *   scripts/dev.sh creds --reset    also give every active demo user (scripts/seed-demo.mjs) a new
 *                                   temporary password through the real reset API, print them, and
 *                                   write them to .data/demo-logins.txt (gitignored, mode 600)
 *
 * The password is read from env/local.env at run time. Never copy it into a committed file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { PW, ROOT, call, login } from './lib/smoke-kit.mjs';

/** docs/SEED_DATA.md §5, in the order of the login screen tabs. */
const DEV_USERS = [
  ['superadmin', 'Super Admin', ''],
  ['stateadmin', 'State Admin', ''],
  ['verifier', 'State Verifier', ''],
  ['approver', 'State Approver', ''],
  ['auditor', 'Auditor', ''],
  ['dapcu.ajmer', 'District Officer (Ajmer)', ''],
  ['incharge.rj001', 'Center In-charge', 'RJ001'],
  ['worker.rj001', 'Center Worker', 'RJ001'],
  ['worker.rj002', 'Center Worker', 'RJ002'],
];

/** Demo users left alone by --reset, so the locked and deactivated states stay visible. */
const KEEP_STATE = new Set(['worker.rj011', 'worker.rj012']);

const row = (cols, widths) => cols.map((c, i) => String(c).padEnd(widths[i])).join('  ');
const W = [16, 26, 7, 0];

console.log('\nDev users (no forced change, no OTP)');
console.log(row(['User ID', 'Role', 'Center', 'Password'], W));
for (const [u, r, c] of DEV_USERS) console.log(row([u, r, c || '-', PW], W));
console.log('\nCenter users: "Center Login" tab, pick the Center. Everyone else: "State / District Login" tab.');
console.log('The captcha answer is the sum shown in the image.');

if (process.argv.includes('--reset')) {
  const su = await login('superadmin');
  const users = (await call('auth', 'GET', '/users?limit=100', { token: su })).body.data ?? [];
  const dev = new Set(DEV_USERS.map(([u]) => u));
  const lines = [];
  for (const u of users) {
    if (dev.has(u.user_code) || KEEP_STATE.has(u.user_code) || u.user_code.startsWith('smoke.')) continue;
    const r = await call('auth', 'POST', `/users/${u.id}/password-reset`, { token: su, body: {} });
    if (r.status !== 200) {
      console.log(`  could not reset ${u.user_code}: ${r.body?.code} ${r.body?.message}`);
      continue;
    }
    const center = /^(worker|incharge)\.(rj\d{3})$/.exec(u.user_code)?.[2]?.toUpperCase() ?? '-';
    lines.push(row([u.user_code, u.full_name ?? '', center, r.body.data.temporary_password], [18, 22, 7, 0]));
  }
  const dir = join(ROOT, '.data');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'demo-logins.txt');
  writeFileSync(file, `${row(['User ID', 'Name', 'Center', 'Temporary password'], [18, 22, 7, 0])}\n${lines.join('\n')}\n`, { mode: 0o600 });
  console.log(`\nDemo users: ${lines.length} temporary passwords (also in .data/demo-logins.txt)`);
  console.log(row(['User ID', 'Name', 'Center', 'Temporary password'], [18, 22, 7, 0]));
  for (const l of lines) console.log(l);
  console.log('\nThe first login asks for a new password and an OTP. The OTP is in .logs/auth.log (SMS_PROVIDER=log).');
}
