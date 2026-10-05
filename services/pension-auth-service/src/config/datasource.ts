import 'reflect-metadata';
import path from 'node:path';
import { DataSource } from 'typeorm';
import { config } from './index';

const cfg = config();

/**
 * Schema pension_auth (and pension_audit, created by migration 002). synchronize is ALWAYS false
 * (rule R-DB-2): the schema changes only through the hand-written files in src/migration/.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: cfg.DB_HOST,
  port: cfg.DB_PORT,
  username: cfg.AUTH_DB_USER,
  password: cfg.AUTH_DB_PASSWORD,
  database: cfg.DB_NAME,
  schema: 'pension_auth',
  poolSize: cfg.DB_POOL_MAX,
  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'migrations',
  entities: [path.join(__dirname, '..', 'entities', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, '..', 'migration', '*.{ts,js}')],
  logging: cfg.LOG_LEVEL === 'debug' ? ['query', 'error'] : ['error'],
  extra: { application_name: 'pension-auth-service' },
});
