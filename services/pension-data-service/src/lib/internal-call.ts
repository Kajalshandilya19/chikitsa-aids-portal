import jwt from 'jsonwebtoken';
import { baseConfig } from './base-config';
import { AppError } from './errors';
import { getRequestContext } from './request-context';

/**
 * Service-to-service calls (docs/ARCHITECTURE.md §4, rule R-API-6).
 *
 * The caller attaches `x-service-token: <JWT>`, HS256-signed with the shared JWT_SIGNING_KEY, with a
 * DIFFERENT audience from user access tokens (`<JWT_AUDIENCE>-internal`) and a `svc: true` claim.
 * Consequences:
 *   - a user's access token can never pass as a service token, and a service token can never pass as
 *     a user token (lib/access-token.ts refuses `svc`);
 *   - browsers never hold the key, so they cannot mint one;
 *   - `/internal/*` routes accept ONLY a service token (`requireServiceToken`).
 */
export const SERVICE_TOKEN_HEADER = 'x-service-token';
const TTL_S = 300;

let serviceName = 'unknown-service';
export const registerServiceName = (name: string): void => {
  serviceName = name;
};
export const currentServiceName = (): string => serviceName;

const internalAudience = () => `${baseConfig().JWT_AUDIENCE}-internal`;

let cached: { token: string; exp: number } | null = null;

export const getServiceToken = (): string => {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 30 > now) return cached.token;
  const cfg = baseConfig();
  const token = jwt.sign({ svc: true }, cfg.JWT_SIGNING_KEY, {
    algorithm: 'HS256',
    subject: serviceName,
    issuer: cfg.JWT_ISSUER,
    audience: internalAudience(),
    expiresIn: TTL_S,
  });
  cached = { token, exp: now + TTL_S };
  return token;
};

export const resetServiceTokenForTests = (): void => {
  cached = null;
};

/** The calling service's name, or throws when the token is missing, forged, expired or a user token. */
export const verifyServiceToken = (raw: string): string => {
  const cfg = baseConfig();
  const payload = jwt.verify(raw, cfg.JWT_SIGNING_KEY, {
    algorithms: ['HS256'],
    issuer: cfg.JWT_ISSUER,
    audience: internalAudience(),
  }) as jwt.JwtPayload;
  if (payload['svc'] !== true || typeof payload.sub !== 'string' || !payload.sub) throw new Error('not a service token');
  return payload.sub;
};

/** True only when the request carries a service token that VERIFIES. Used by the rate limiter's skip. */
export const isInternalCall = (req: { headers: Record<string, unknown> }): boolean => {
  const raw = req.headers[SERVICE_TOKEN_HEADER];
  if (typeof raw !== 'string' || raw.length === 0) return false;
  try {
    verifyServiceToken(raw);
    return true;
  } catch {
    return false;
  }
};

export type ServiceKey = 'auth' | 'core' | 'data';

const baseUrlOf = (svc: ServiceKey): string => {
  const cfg = baseConfig();
  return { auth: cfg.AUTH_SERVICE_URL, core: cfg.CORE_SERVICE_URL, data: cfg.DATA_SERVICE_URL }[svc];
};

const MOUNT: Record<ServiceKey, string> = { auth: '/auth/api/v1', core: '/core/api/v1', data: '/data/api/v1' };

/**
 * Calls a sibling service's `/internal/...` route and returns the envelope's `data`.
 * `path` starts with `/internal/`. Errors from the sibling keep their status and code (so a 404 stays
 * a 404); network failures become 502 E_UPSTREAM.
 */
export const internalCall = async <T>(
  svc: ServiceKey,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; timeoutMs?: number } = {},
): Promise<T> => {
  if (!path.startsWith('/internal/')) throw new Error(`internalCall path must start with /internal/: ${path}`);
  const url = `${baseUrlOf(svc)}${MOUNT[svc]}${path}`;
  const headers: Record<string, string> = { [SERVICE_TOKEN_HEADER]: getServiceToken(), accept: 'application/json' };
  const requestId = getRequestContext()?.request_id;
  if (requestId) headers['x-request-id'] = requestId;
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 10_000),
    });
  } catch (err) {
    throw new AppError(502, `${svc} service unreachable`, { code: 'E_UPSTREAM', cause: err, expose: true });
  }
  const body = (await res.json().catch(() => null)) as { success?: boolean; data?: T; code?: string; message?: string; details?: unknown } | null;
  if (!res.ok || !body || body.success !== true) {
    throw new AppError(res.ok ? 502 : res.status, body?.message ?? `${svc} service error`, {
      code: body?.code ?? 'E_UPSTREAM',
      details: body?.details,
      expose: true,
    });
  }
  return body.data as T;
};
