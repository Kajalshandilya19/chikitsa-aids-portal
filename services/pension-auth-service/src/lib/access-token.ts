import jwt from 'jsonwebtoken';
import { baseConfig } from './base-config';
import { UnauthorizedError } from './errors';
import type { ScopeLevel } from './permission-codes';

/**
 * The signed-in caller, as carried by the access token (docs/ARCHITECTURE.md §3).
 *
 * One ACTIVE assignment at a time: a user holding two assignments (e.g. worker at RJ001 and at
 * RJ014) picks one at login and switches with POST /auth/switch. Every scope check uses the active
 * assignment's district / center, never "all the user's centers".
 *
 * Only pension-auth-service ISSUES tokens. Every service VERIFIES them locally with the shared key.
 */
export interface AuthContext {
  userId: string;
  sessionId: string;
  userCode: string;
  name: string;
  /** user_roles.id of the active assignment */
  assignmentId: string;
  roleId: string;
  roleCode: string;
  scope: ScopeLevel;
  districtId: string | null;
  centerId: string | null;
  centerCode: string | null;
  /** true until the user sets their own password: every route except a short allow-list refuses. */
  mustChangePassword: boolean;
}

interface Claims {
  sub: string;
  sid: string;
  uc: string;
  nm: string;
  asg: string;
  rid: string;
  rc: string;
  sc: ScopeLevel;
  did: string | null;
  cid: string | null;
  cc: string | null;
  pwc: boolean;
  typ: 'access';
}

export const issueAccessToken = (ctx: AuthContext): { token: string; expiresAt: string } => {
  const cfg = baseConfig();
  const claims: Omit<Claims, 'sub'> = {
    sid: ctx.sessionId,
    uc: ctx.userCode,
    nm: ctx.name,
    asg: ctx.assignmentId,
    rid: ctx.roleId,
    rc: ctx.roleCode,
    sc: ctx.scope,
    did: ctx.districtId,
    cid: ctx.centerId,
    cc: ctx.centerCode,
    pwc: ctx.mustChangePassword,
    typ: 'access',
  };
  const token = jwt.sign(claims, cfg.JWT_SIGNING_KEY, {
    algorithm: 'HS256',
    subject: ctx.userId,
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
    expiresIn: cfg.ACCESS_TTL_MIN * 60,
  });
  return { token, expiresAt: new Date(Date.now() + cfg.ACCESS_TTL_MIN * 60_000).toISOString() };
};

export const verifyAccessToken = (token: string): AuthContext => {
  const cfg = baseConfig();
  let c: Claims & { svc?: unknown };
  try {
    c = jwt.verify(token, cfg.JWT_SIGNING_KEY, {
      algorithms: ['HS256'],
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
    }) as unknown as Claims & { svc?: unknown };
  } catch {
    throw new UnauthorizedError('session expired or invalid, please log in again', { code: 'E_TOKEN_INVALID' });
  }
  if (c.typ !== 'access' || c.svc !== undefined || !c.sub || !c.sid || !c.rid) {
    throw new UnauthorizedError('session expired or invalid, please log in again', { code: 'E_TOKEN_INVALID' });
  }
  return {
    userId: c.sub,
    sessionId: c.sid,
    userCode: c.uc,
    name: c.nm,
    assignmentId: c.asg,
    roleId: c.rid,
    roleCode: c.rc,
    scope: c.sc,
    districtId: c.did ?? null,
    centerId: c.cid ?? null,
    centerCode: c.cc ?? null,
    mustChangePassword: c.pwc === true,
  };
};
