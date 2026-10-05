import 'reflect-metadata';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';

/**
 * `npm run migration:run | migration:revert | migration:show`. Refuses to change the schema unless
 * DB_ALLOW_MIGRATIONS=true (rule R-DB-6). In Kubernetes the migration Job sets it; nothing else does.
 */
const main = async () => {
  const cmd = process.argv[2] ?? 'show';
  const cfg = config();
  if (cmd !== 'show' && !cfg.DB_ALLOW_MIGRATIONS) throw new Error(`refusing to ${cmd} migrations: DB_ALLOW_MIGRATIONS is not true`);
  await AppDataSource.initialize();
  console.log(`target ${cfg.DB_HOST}:${cfg.DB_PORT}/${cfg.DB_NAME} as ${cfg.DATA_DB_USER} (APP_ENV=${cfg.APP_ENV})`);
  if (cmd === 'run') {
    const ran = await AppDataSource.runMigrations({ transaction: 'each' });
    console.log(ran.length ? `applied: ${ran.map((m) => m.name).join(', ')}` : 'no pending migrations');
  } else if (cmd === 'revert') {
    await AppDataSource.undoLastMigration({ transaction: 'each' });
    console.log('reverted the last migration');
  } else {
    console.log((await AppDataSource.showMigrations()) ? 'there are pending migrations' : 'schema is up to date');
  }
  await AppDataSource.destroy();
};

main().catch((err) => {
  console.error(`migration error: ${(err as Error).message}`);
  process.exit(1);
});
