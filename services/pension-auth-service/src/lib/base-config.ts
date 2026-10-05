import { z } from 'zod';

/**
 * Settings EVERY service needs. A service's own src/config/index.ts extends `baseEnvSchema` with its
 * service-only keys; it never redefines a key from here.
 *
 * Values come from the process environment: scripts/dev.sh exports env/local.env, the npm scripts pass
 * `--env-file-if-exists=../../env/local.env`, and in Kubernetes the Secret is mounted with envFrom.
 *
 * The profile guards at the bottom (`assertSafeProfile`) are security rules S-CFG-1..5 in docs/SECURITY.md.
 */

export const bool = (def: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(def ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');

const base64Key = (name: string) =>
  z
    .string()
    .min(40, `${name} must be base64 of >= 32 bytes (scripts/setup.sh generates it)`)
    .refine((v) => Buffer.from(v, 'base64').length >= 32, `${name} must decode to >= 32 bytes`);

export const baseEnvSchema = z.object({
  APP_ENV: z.enum(['local', 'uat', 'production']).default('local'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  /** Kubernetes sets PORT; locally each service falls back to its own <NAME>_SERVICE_PORT. */
  PORT: z.coerce.number().int().positive().optional(),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3200'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  AUTH_SERVICE_URL: z.string().url().default('http://127.0.0.1:3201'),
  CORE_SERVICE_URL: z.string().url().default('http://127.0.0.1:3202'),
  DATA_SERVICE_URL: z.string().url().default('http://127.0.0.1:3203'),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(15432),
  DB_NAME: z.string().min(1).default('hiv_pension'),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  DB_ALLOW_MIGRATIONS: bool(false),

  REDIS_HOST: z.string().default(''),
  REDIS_PORT: z.coerce.number().int().positive().default(16379),
  REDIS_PASSWORD: z.string().default(''),

  MINIO_ENDPOINT: z.string().min(1).default('127.0.0.1'),
  MINIO_PORT: z.coerce.number().int().positive().default(19010),
  MINIO_USE_SSL: bool(false),
  MINIO_REGION: z.string().default('us-east-1'),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(8),
  MINIO_BUCKET: z.string().min(3).default('hiv-pension-private'),

  JWT_SIGNING_KEY: z.string().min(32, 'JWT_SIGNING_KEY must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1).default('hiv-pension-auth'),
  JWT_AUDIENCE: z.string().min(1).default('hiv-pension'),
  PII_ENCRYPTION_KEY: base64Key('PII_ENCRYPTION_KEY'),
  PII_HMAC_KEY: base64Key('PII_HMAC_KEY'),
  ACCESS_TTL_MIN: z.coerce.number().int().min(5).max(60).default(15),
});

export type BaseConfig = z.infer<typeof baseEnvSchema>;

/** Turns a zod failure into one readable block naming every bad key. */
export const parseEnv = <T extends z.ZodTypeAny>(schema: T, service: string): z.infer<T> => {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`invalid ${service} configuration:\n${issues}`);
  }
  assertSafeProfile(parsed.data as BaseConfig & Record<string, unknown>);
  return parsed.data;
};

/**
 * Settings that are only tolerable on a developer laptop. Refused everywhere else, so a copied local
 * env file can never weaken UAT or production (docs/SECURITY.md S-CFG-1..4).
 */
export const assertSafeProfile = (env: BaseConfig & Record<string, unknown>): void => {
  if (env.APP_ENV === 'local' && env.NODE_ENV === 'production') {
    throw new Error('APP_ENV=local cannot run with NODE_ENV=production (S-CFG-5): every image sets NODE_ENV=production');
  }
  if (env.APP_ENV === 'local') return;
  const problems: string[] = [];
  if (env.CORS_ORIGIN.split(',').some((o) => o.trim() === '*')) problems.push('CORS_ORIGIN must not be "*" (S-CFG-1)');
  if (env['MFA_ENFORCED'] === false) problems.push('MFA_ENFORCED=false is only allowed when APP_ENV=local (S-CFG-2)');
  if (env['COOKIE_SECURE'] === false) problems.push('COOKIE_SECURE=false is only allowed when APP_ENV=local (S-CFG-3)');
  if (env['SMS_PROVIDER'] === 'log') problems.push('SMS_PROVIDER=log is only allowed when APP_ENV=local (S-CFG-4)');
  if (problems.length) throw new Error(`unsafe configuration for APP_ENV=${env.APP_ENV}:\n  ${problems.join('\n  ')}`);
};

let cachedBase: BaseConfig | undefined;

/** The shared settings, for lib modules that must not import a service's own config. */
export const baseConfig = (): BaseConfig => {
  if (!cachedBase) cachedBase = parseEnv(baseEnvSchema, 'service');
  return cachedBase;
};

/** Test seam. */
export const resetBaseConfigForTests = (): void => {
  cachedBase = undefined;
};
