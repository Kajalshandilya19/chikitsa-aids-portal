import { z } from 'zod';
import { baseEnvSchema, parseEnv } from '../lib/base-config';

/** core-service settings: the shared ones (lib/base-config.ts) plus the keys below. */
const envSchema = baseEnvSchema.extend({
  CORE_SERVICE_PORT: z.coerce.number().int().positive().default(3202),
  CORE_DB_USER: z.string().min(1).default('pension_core_svc'),
  CORE_DB_PASSWORD: z.string().min(1, 'CORE_DB_PASSWORD is required'),
});

export type AppConfig = z.infer<typeof envSchema> & { port: number };

let cached: AppConfig | undefined;

export const config = (): AppConfig => {
  if (cached) return cached;
  const env = parseEnv(envSchema, 'pension-core-service');
  cached = { ...env, port: env.PORT ?? env.CORE_SERVICE_PORT };
  return cached;
};

/** Test seam. */
export const resetConfigForTests = (): void => {
  cached = undefined;
};
