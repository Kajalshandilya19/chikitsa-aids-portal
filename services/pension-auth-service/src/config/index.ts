import { z } from 'zod';
import { baseEnvSchema, bool, parseEnv } from '../lib/base-config';

/** auth-service settings: the shared ones (lib/base-config.ts) plus the keys below. */
const envSchema = baseEnvSchema.extend({
  AUTH_SERVICE_PORT: z.coerce.number().int().positive().default(3201),
  AUTH_DB_USER: z.string().min(1).default('pension_auth_svc'),
  AUTH_DB_PASSWORD: z.string().min(1, 'AUTH_DB_PASSWORD is required'),
  /** Granted EXECUTE on pension_audit.append_event() by the audit migration. */
  CORE_DB_USER: z.string().regex(/^[a-z_][a-z0-9_]{1,62}$/).default('pension_core_svc'),
  DATA_DB_USER: z.string().regex(/^[a-z_][a-z0-9_]{1,62}$/).default('pension_data_svc'),

  REFRESH_TTL_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  SESSION_IDLE_MIN: z.coerce.number().int().min(5).max(240).default(30),
  LOGIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(100).default(10),
  PASSWORD_MAX_FAILED: z.coerce.number().int().min(3).max(10).default(5),
  LOCKOUT_MIN: z.coerce.number().int().min(1).max(1440).default(15),
  MFA_ENFORCED: bool(true),
  /** Shown in the authenticator app on a staff phone: never mention HIV (R-PII-6). */
  MFA_ISSUER: z.string().min(1).default('RSACS Pension Portal'),
  SMS_PROVIDER: z.enum(['log', 'esanchar']).default('esanchar'),
  ESANCHAR_URL: z.string().default(''),
  DEV_USER_PASSWORD: z.string().default(''),
});

export type AppConfig = z.infer<typeof envSchema> & { port: number };

let cached: AppConfig | undefined;

export const config = (): AppConfig => {
  if (cached) return cached;
  const env = parseEnv(envSchema, 'pension-auth-service');
  cached = { ...env, port: env.PORT ?? env.AUTH_SERVICE_PORT };
  return cached;
};

/** Test seam. */
export const resetConfigForTests = (): void => {
  cached = undefined;
};
