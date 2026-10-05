import { z } from 'zod';
import { baseEnvSchema, parseEnv } from '../lib/base-config';

/** data-service settings: the shared ones (lib/base-config.ts) plus the keys below. */
const envSchema = baseEnvSchema.extend({
  DATA_SERVICE_PORT: z.coerce.number().int().positive().default(3203),
  DATA_DB_USER: z.string().min(1).default('pension_data_svc'),
  DATA_DB_PASSWORD: z.string().min(1, 'DATA_DB_PASSWORD is required'),
  IMPORT_MAX_FILE_MB: z.coerce.number().int().min(1).max(50).default(10),
  IMPORT_MAX_ROWS: z.coerce.number().int().min(1).max(500_000).default(100_000),
  IMPORT_STAGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});

export type AppConfig = z.infer<typeof envSchema> & { port: number };

let cached: AppConfig | undefined;

export const config = (): AppConfig => {
  if (cached) return cached;
  const env = parseEnv(envSchema, 'pension-data-service');
  cached = { ...env, port: env.PORT ?? env.DATA_SERVICE_PORT };
  return cached;
};

/** Test seam. */
export const resetConfigForTests = (): void => {
  cached = undefined;
};
