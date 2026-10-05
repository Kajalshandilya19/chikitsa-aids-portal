#!/usr/bin/env node
/**
 * Creates the next migration file of a service from the template (rule R-DB-5).
 *
 *   node scripts/new-migration.mjs <auth|core|data> <kebab-name>
 *   node scripts/new-migration.mjs core beneficiaries
 *     -> services/pension-core-service/src/migration/1802000000002-beneficiaries.ts
 *
 * Numbers follow the service's band (auth 1801…, core 1802…, data 1803…) and are sequential, so the
 * order is obvious in review. Fill in up() AND down(); run `scripts/dev.sh migrate`, then
 * `npm run migration:revert` and `migration:run` again to prove down() works.
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BANDS = { auth: 1801, core: 1802, data: 1803 };
const SCHEMA = { auth: 'pension_auth', core: 'pension_core', data: 'pension_data' };

const [service, name] = process.argv.slice(2);
if (!BANDS[service] || !/^[a-z][a-z0-9-]{2,60}$/.test(name ?? '')) {
  console.error('usage: node scripts/new-migration.mjs <auth|core|data> <kebab-name>   (lowercase letters, digits, hyphens)');
  process.exit(2);
}
const dir = join(ROOT, 'services', `pension-${service}-service`, 'src', 'migration');
const existing = readdirSync(dir).filter((f) => /^\d{13}-.+\.ts$/.test(f));
const band = BANDS[service];
const numbers = existing.map((f) => Number(f.slice(0, 13))).filter((n) => Math.floor(n / 1e9) === band);
const next = numbers.length ? Math.max(...numbers) + 1 : band * 1e9 + 1;
if (existing.some((f) => f.endsWith(`-${name}.ts`))) {
  console.error(`a migration named "${name}" already exists in ${dir}`);
  process.exit(1);
}
const className = `${name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('')}${next}`;
const file = join(dir, `${next}-${name}.ts`);
if (existsSync(file)) {
  console.error(`${file} exists`);
  process.exit(1);
}

writeFileSync(
  file,
  `import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TODO: one sentence on what this migration does and which doc section specifies it
 * (e.g. docs/phases/PHASE_1_SOCH_BENEFICIARIES.md §1).
 *
 * Checklist (AGENTS.md §6, HOWTO.md C):
 *   - schema-qualified names (${SCHEMA[service]}.<table>), uuid PK DEFAULT gen_random_uuid(), created_at/updated_at timestamptz
 *   - personal data: text column + piiTransformer in the entity; <name>_lookup varchar(64) / <name>_last4 when needed
 *   - no foreign keys to another service's schema (R-DB-1)
 *   - down() undoes up() exactly
 *   - NEVER edit this file after it has run anywhere: add a new migration instead
 */
export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(\`
      -- TODO: CREATE TABLE ${SCHEMA[service]}.<name> ( ... )
      SELECT 1
    \`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(\`
      -- TODO: DROP TABLE IF EXISTS ${SCHEMA[service]}.<name>
      SELECT 1
    \`);
  }
}
`,
);
console.log(`created ${file.replace(`${ROOT}/`, '')}`);
console.log('next: write the SQL, add/adjust the entity, run scripts/dev.sh migrate, test revert + run, update docs/DATA_MODEL.md');
