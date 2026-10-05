import type { Request, RequestHandler, Response } from 'express';
import { verifyAccessToken, type AuthContext } from './access-token';
import { ForbiddenError, UnauthorizedError } from './errors';
import { SERVICE_TOKEN_HEADER, verifyServiceToken } from './internal-call';
import type { PermissionCode } from './permission-codes';
import { updateRequestContext } from './request-context';

/**
 * authenticate / authorize / requireServiceToken: the three guards every route uses
 * (rules R-API-4 and R-RBAC-2). Route order is ALWAYS:
 *   router.<verb>(path, authenticate(), perUser(...), authorize(P.X), validate*(...), handler)
 *
 * Permissions are resolved per ROLE (the active assignment's role), through a resolver each service
 * registers at boot: auth-service reads its own tables, core and data ask auth-service over
 * /internal/roles/:id/permissions. Results are cached for 60 s per role.
 */

export type PermissionResolver = (roleId: string) => Promise<readonly string[]>;
export type SessionCheck = (auth: AuthContext) => Promise<void>;

let resolver: PermissionResolver | null = null;
let sessionCheck: SessionCheck | null = null;
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; perms: readonly string[] }>();

export const registerPermissionResolver = (fn: PermissionResolver): void => {
  resolver = fn;
};

/** Optional extra check after the token verifies (auth-service: the session is not revoked). */
export const registerSessionCheck = (fn: SessionCheck): void => {
  sessionCheck = fn;
};

export const clearPermissionCache = (roleId?: string): void => {
  if (roleId) cache.delete(roleId);
  else cache.clear();
};

export const permissionsForRole = async (roleId: string): Promise<readonly string[]> => {
  const hit = cache.get(roleId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.perms;
  if (!resolver) throw new Error('no permission resolver registered (call registerPermissionResolver at boot)');
  const perms = await resolver(roleId);
  cache.set(roleId, { at: Date.now(), perms });
  return perms;
};

/** The verified caller. Throws 401 when the route forgot `authenticate()`. */
export const authOf = (res: Response): AuthContext => {
  const a = res.locals['auth'] as AuthContext | undefined;
  if (!a) throw new UnauthorizedError();
  return a;
};

export interface AuthenticateOptions {
  /** Only for the few auth routes a user with a temporary password may call. */
  allowPasswordChangePending?: boolean;
}

export const authenticate =
  (options: AuthenticateOptions = {}): RequestHandler =>
  async (req: Request, res, next) => {
    try {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!token) throw new UnauthorizedError('login required', { code: 'E_NO_TOKEN' });
      const auth = verifyAccessToken(token);
      if (sessionCheck) await sessionCheck(auth);
      if (auth.mustChangePassword && !options.allowPasswordChangePending) {
        throw new ForbiddenError('set a new password before continuing', { code: 'E_PASSWORD_CHANGE_REQUIRED' });
      }
      res.locals['auth'] = auth;
      updateRequestContext({
        user_id: auth.userId,
        session_id: auth.sessionId,
        active_role: auth.roleCode,
        active_role_id: auth.roleId,
        active_facility_id: auth.centerId,
      });
      return next();
    } catch (err) {
      return next(err);
    }
  };

/** Any-of: the active role must hold at least one of `required`. */
export const authorize =
  (...required: PermissionCode[]): RequestHandler =>
  async (_req, res, next) => {
    try {
      if (required.length === 0) throw new Error('authorize() needs at least one permission code');
      const perms = await permissionsForRole(authOf(res).roleId);
      res.locals['permissions'] = perms;
      if (required.some((p) => perms.includes(p))) return next();
      return next(new ForbiddenError('you do not have permission for this action', { details: { required } }));
    } catch (err) {
      return next(err);
    }
  };

/** Guard for `/internal/*` routers: a valid service token, nothing else. */
export const requireServiceToken = (): RequestHandler => (req, res, next) => {
  const raw = req.headers[SERVICE_TOKEN_HEADER];
  if (typeof raw !== 'string' || !raw) return next(new UnauthorizedError('service token required', { code: 'E_SERVICE_TOKEN' }));
  try {
    res.locals['caller_service'] = verifyServiceToken(raw);
    return next();
  } catch {
    return next(new UnauthorizedError('invalid service token', { code: 'E_SERVICE_TOKEN' }));
  }
};

/** The caller plus its permissions, for handlers that decide per action. Call after authorize(). */
export interface Caller {
  auth: AuthContext;
  perms: readonly string[];
  can: (...anyOf: PermissionCode[]) => boolean;
  require: (...anyOf: PermissionCode[]) => void;
}

export const caller = async (res: Response): Promise<Caller> => {
  const auth = authOf(res);
  const perms = (res.locals['permissions'] as readonly string[] | undefined) ?? (await permissionsForRole(auth.roleId));
  const can = (...anyOf: PermissionCode[]) => anyOf.some((p) => perms.includes(p));
  return {
    auth,
    perms,
    can,
    require: (...anyOf: PermissionCode[]) => {
      if (!can(...anyOf)) throw new ForbiddenError('you do not have permission for this action', { details: { required: anyOf } });
    },
  };
};
