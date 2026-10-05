import 'reflect-metadata';
import { config } from './config';
import { AppDataSource } from './config/datasource';
import { createApp, SERVICE_NAME } from './app';
import { closeKv } from './lib/kv';
import { createLogger } from './lib/logger';

const logger = createLogger({ service: SERVICE_NAME });

const connect = async (attempts = 20): Promise<void> => {
  for (let i = 1; i <= attempts; i++) {
    try {
      await AppDataSource.initialize();
      return;
    } catch (err) {
      logger.warn(`database not reachable (attempt ${i}/${attempts}): ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error('database unreachable, giving up');
};

const main = async () => {
  const cfg = config();
  await connect();
  logger.info(`database connected ${cfg.DB_HOST}:${cfg.DB_PORT}/${cfg.DB_NAME} as ${cfg.AUTH_DB_USER} (APP_ENV=${cfg.APP_ENV})`);
  const server = createApp().listen(cfg.port, () => logger.info(`${SERVICE_NAME} listening on :${cfg.port}`));
  const shutdown = () => {
    server.close(() => void Promise.allSettled([AppDataSource.destroy(), closeKv()]).finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

main().catch((err) => {
  logger.error((err as Error).message);
  process.exit(1);
});
