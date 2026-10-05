import 'reflect-metadata';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { config } from './index';

const cfg = config();

/**
 * Schema pension_data. synchronize is ALWAYS false (rule R-DB-2): the schema changes only through the
 * hand-written files in src/migration/. This service can write the audit log only through
 * pension_audit.append_event() (lib/audit.ts).
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: cfg.DB_HOST,
  port: cfg.DB_PORT,
  username: cfg.DATA_DB_USER,
  password: cfg.DATA_DB_PASSWORD,
  database: cfg.DB_NAME,
  schema: 'pension_data',
  poolSize: cfg.DB_POOL_MAX,
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'migrations',
  entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migration', '*.{ts,js}')],
  logging: cfg.LOG_LEVEL === 'debug' ? ['query', 'error'] : ['error'],
  extra: { application_name: 'pension-data-service' },
});
