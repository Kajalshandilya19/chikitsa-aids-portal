#!/usr/bin/env node
/**
 * Static checks for AGENTS.md rules that ESLint and the tests cannot see. Run by `scripts/dev.sh check`.
 * Every failure names its rule id. Exit 1 on any failure.
 *
 *   R-STACK-2  no `xlsx` (SheetJS npm) dependency or import anywhere
 *   R-PII-5    no localStorage / sessionStorage / indexedDB in the web app
 *   R-WEB-4    no em dash in user-facing text (web messages, web src, service error messages)
 *   R-DB-2     no `synchronize: true`
 *   R-RBAC-2   every route line in services/*\/src/routes/v1 has `guard`/`authenticate(`, or a `// public:` reason on the line above
 *   R-PII-1    entity columns with a personal-data name use piiTransformer
 *   R-GIT-1    no env/*.env (other than examples) tracked by git
 *   R-DB-5     a committed migration file is never modified
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fail = (rule, where, what) => problems.push(`${rule}  ${where}  ${what}`);

const walk = (dir, exts, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.next', 'dist', 'coverage', '.git'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
};
const rel = (p) => relative(ROOT, p);
const SERVICES = ['auth', 'core', 'data'].map((s) => join(ROOT, 'services', `pension-${s}-service`));
const WEB = join(ROOT, 'web', 'pension-web');

// R-STACK-2
for (const pkg of [...SERVICES, WEB].map((d) => join(d, 'package.json')).filter(existsSync)) {
  const j = JSON.parse(readFileSync(pkg, 'utf8'));
  if ({ ...j.dependencies, ...j.devDependencies }.xlsx) fail('R-STACK-2', rel(pkg), 'depends on "xlsx"');
}
for (const f of [...SERVICES, WEB].flatMap((d) => walk(join(d, 'src'), ['.ts', '.tsx']))) {
  const s = readFileSync(f, 'utf8');
  if (/from ['"]xlsx['"]|import\(['"]xlsx['"]\)|require\(['"]xlsx['"]\)/.test(s)) fail('R-STACK-2', rel(f), 'imports "xlsx"');
  if (/synchronize:\s*true/.test(s)) fail('R-DB-2', rel(f), 'synchronize: true');
}

// R-PII-5 and R-WEB-4 (web)
for (const f of walk(join(WEB, 'src'), ['.ts', '.tsx'])) {
  const s = readFileSync(f, 'utf8');
  if (/\b(localStorage|sessionStorage|indexedDB)\b/.test(s)) fail('R-PII-5', rel(f), 'browser storage API');
  if (s.includes('\u2014')) fail('R-WEB-4', rel(f), 'em dash');
}
for (const f of walk(join(WEB, 'src', 'messages'), ['.json'])) {
  const s = readFileSync(f, 'utf8');
  if (s.includes('\u2014')) fail('R-WEB-4', rel(f), 'em dash');
  if (/[^-]--[^-]/.test(s.replace(/"[^"]*":/g, ''))) fail('R-WEB-4', rel(f), '"--" in a message');
}

// services: em dash in code (messages reach users), routes guarded, PII columns encrypted
const PII_COLUMN = /^(full_name|patient_name|guardian_name|mobile|contact_number|email|address|aadhaar|aadhaar_for_bank|jan_aadhaar|jan_aadhaar_member_id|abha_number|soch_uid|soch_beneficiary_id|art_number|pre_art_number|pid_number|bank_account_number|remarks|reason|decision_reason|original_name|file_name|values|payload|old_value|new_value|mfa_secret)$/;
for (const svc of SERVICES) {
  for (const f of walk(join(svc, 'src'), ['.ts'])) {
    const s = readFileSync(f, 'utf8');
    if (s.includes('\u2014')) fail('R-WEB-4', rel(f), 'em dash (error messages are user-facing)');
  }
  for (const f of walk(join(svc, 'src', 'routes', 'v1'), ['.ts'])) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\b\w+Router\.(get|post|put|patch|delete)\(/.test(line)) return;
      if (/\.\.\.guard|authenticate\(|\bpending\b/.test(line)) return; // `pending` = authenticate({ allowPasswordChangePending })
      if (/\/\/\s*public:/.test(lines[i - 1] ?? '') || /\/\/\s*public:/.test(line)) return;
      fail('R-RBAC-2', `${rel(f)}:${i + 1}`, 'route without guard/authenticate and without a "// public: <reason>" comment');
    });
  }
  for (const f of walk(join(svc, 'src', 'entities'), ['.entity.ts'])) {
    const s = readFileSync(f, 'utf8');
    for (const m of s.matchAll(/@Column\(\{([^}]*)\}\)/g)) {
      const name = /name:\s*'([a-z0-9_]+)'/.exec(m[1])?.[1];
      if (name && PII_COLUMN.test(name) && !m[1].includes('piiTransformer')) fail('R-PII-1', rel(f), `column "${name}" holds personal data but has no piiTransformer`);
    }
  }
}

// git-based rules (skipped before the first commit)
const git = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
};
const tracked = git('git ls-files env');
if (tracked) for (const f of tracked.split('\n').filter((x) => x && !x.endsWith('.example'))) fail('R-GIT-1', f, 'env file tracked by git');
if (git('git rev-parse --verify HEAD')) {
  const changed = git('git diff --name-only --diff-filter=MD HEAD -- "services/*/src/migration/*.ts"');
  if (changed) for (const f of changed.split('\n').filter(Boolean)) fail('R-DB-5', f, 'committed migration modified or deleted: add a new migration instead');
}

if (problems.length) {
  console.log(`rule check FAILED (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('rule check OK: R-STACK-2, R-PII-1, R-PII-5, R-WEB-4, R-DB-2, R-DB-5, R-RBAC-2, R-GIT-1');
