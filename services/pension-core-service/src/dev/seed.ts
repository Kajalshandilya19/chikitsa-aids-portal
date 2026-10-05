import 'reflect-metadata';
import { config } from '../config';
import { SETTINGS } from '../domain/settings';

/**
 * `npm run seed` for core-service. Settings defaults live in code (src/domain/settings.ts), so nothing
 * is inserted; this only reports which settings are still department PLACEHOLDERS (docs/OPEN_QUESTIONS.md).
 */
const main = async () => {
  const cfg = config();
  if (!cfg.DB_ALLOW_MIGRATIONS) throw new Error('refusing to seed: DB_ALLOW_MIGRATIONS is not true');
  const placeholders = SETTINGS.filter((s) => s.placeholder).map((s) => s.key);
  console.log(`settings: ${SETTINGS.length} defined in code, placeholders waiting for the department: ${placeholders.join(', ')}`);
};

main().catch((err) => {
  console.error(`seed error: ${(err as Error).message}`);
  process.exit(1);
});
