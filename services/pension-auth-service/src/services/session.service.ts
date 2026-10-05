import { createHash, randomBytes } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { config } from '../config';
import { AppDataSource } from '../config/datasource';
import { RefreshTokenEntity } from '../entities/refresh-token.entity';
import { SessionEntity } from '../entities/session.entity';
import type { AuthContext } from '../lib/access-token';
import { AUDIT, writeAudit } from '../lib/audit';
import { UnauthorizedError } from '../lib/errors';

/**
 * Sessions and rotating refresh tokens (docs/SECURITY.md S-SESS-1..4).
 *   - absolute lifetime REFRESH_TTL_HOURS from login, never extended
 *   - idle timeout SESSION_IDLE_MIN since the last refresh
 *   - each refresh returns a NEW refresh token; reusing an old one revokes the session (replay)
 *   - access tokens carry the session id; auth-service rejects them once the session is revoked
 *     (core and data accept them until they expire, at most ACCESS_TTL_MIN)
 */
export type RevokeReason = 'LOGOUT' | 'REPLAY' | 'SWITCH' | 'IDLE' | 'ADMIN' | 'PASSWORD_CHANGED' | 'DEACTIVATED' | 'ASSIGNMENT_REMOVED';

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');
const sessions = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(SessionEntity);
const tokens = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(RefreshTokenEntity);

export interface SessionMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface IssuedRefresh {
  sessionId: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const newRefresh = async (em: EntityManager | undefined, sessionId: string, expiresAt: Date): Promise<{ id: string; token: string }> => {
  const token = randomBytes(48).toString('base64url');
  const row = await tokens(em).save(tokens(em).create({ sessionId, tokenHash: sha256(token), expiresAt, replacedBy: null }));
  return { id: row.id, token };
};

// Short cache of "is this session still live" so every request does not hit the database.
const LIVE_CACHE_MS = 10_000;
const liveCache = new Map<string, number>();

export const sessionService = {
  async start(userId: string, assignmentId: string, mfaVerified: boolean, meta: SessionMeta, em?: EntityManager): Promise<IssuedRefresh> {
    const cfg = config();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + cfg.REFRESH_TTL_HOURS * 3_600_000);
    const session = await sessions(em).save(
      sessions(em).create({
        userId,
        assignmentId,
        lastSeenAt: now,
        expiresAt,
        revokedAt: null,
        revokedReason: null,
        mfaVerified,
        ip: meta.ip?.slice(0, 64) ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      }),
    );
    const refresh = await newRefresh(em, session.id, expiresAt);
    return { sessionId: session.id, refreshToken: refresh.token, refreshExpiresAt: expiresAt };
  },

  /**
   * Rotates a refresh token. Returns the session it belongs to and the new token.
   * The transaction RETURNS an outcome and the error is thrown after commit: throwing inside would roll
   * back the revocation of a replayed or expired session.
   */
  async rotate(token: string): Promise<{ session: SessionEntity } & IssuedRefresh> {
    const cfg = config();
    type Outcome = { kind: 'ok'; session: SessionEntity; refresh: string } | { kind: 'invalid' } | { kind: 'replay' } | { kind: 'expired' } | { kind: 'idle' };
    const out: Outcome = await AppDataSource.transaction(async (em): Promise<Outcome> => {
      const row = await tokens(em).findOne({ where: { tokenHash: sha256(token) }, lock: { mode: 'pessimistic_write' } });
      if (!row) return { kind: 'invalid' };
      const session = await sessions(em).findOne({ where: { id: row.sessionId } });
      if (!session || session.revokedAt) return { kind: 'invalid' };
      if (row.replacedBy) {
        await this.revoke(session.id, 'REPLAY', em);
        await writeAudit(em, { action: AUDIT.SESSION_REPLAY, outcome: 'FAILURE', actorUserId: session.userId, entityType: 'session', entityId: session.id });
        return { kind: 'replay' };
      }
      const now = Date.now();
      if (session.expiresAt.getTime() < now) {
        await this.revoke(session.id, 'IDLE', em);
        return { kind: 'expired' };
      }
      if (session.lastSeenAt.getTime() + cfg.SESSION_IDLE_MIN * 60_000 < now) {
        await this.revoke(session.id, 'IDLE', em);
        return { kind: 'idle' };
      }
      const next = await newRefresh(em, session.id, session.expiresAt);
      await tokens(em).update({ id: row.id }, { replacedBy: next.id });
      await sessions(em).update({ id: session.id }, { lastSeenAt: new Date(now) });
      return { kind: 'ok', session, refresh: next.token };
    });
    switch (out.kind) {
      case 'ok':
        return { session: out.session, sessionId: out.session.id, refreshToken: out.refresh, refreshExpiresAt: out.session.expiresAt };
      case 'replay':
        throw new UnauthorizedError('session revoked, please log in again', { code: 'E_REFRESH_REPLAY' });
      case 'expired':
        throw new UnauthorizedError('session expired, please log in again', { code: 'E_SESSION_EXPIRED' });
      case 'idle':
        throw new UnauthorizedError('you were inactive for too long, please log in again', { code: 'E_SESSION_EXPIRED' });
      default:
        throw new UnauthorizedError('session expired, please log in again', { code: 'E_REFRESH_INVALID' });
    }
  },

  async revoke(sessionId: string, reason: RevokeReason, em?: EntityManager): Promise<void> {
    await (em ?? AppDataSource.manager).query(
      'UPDATE pension_auth.sessions SET revoked_at = now(), revoked_reason = $2 WHERE id = $1 AND revoked_at IS NULL',
      [sessionId, reason],
    );
    liveCache.delete(sessionId);
  },

  async revokeAllForUser(userId: string, reason: RevokeReason, em?: EntityManager): Promise<void> {
    await (em ?? AppDataSource.manager).query(
      'UPDATE pension_auth.sessions SET revoked_at = now(), revoked_reason = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, reason],
    );
    liveCache.clear();
  },

  async revokeForAssignment(assignmentId: string, reason: RevokeReason, em?: EntityManager): Promise<void> {
    await (em ?? AppDataSource.manager).query(
      'UPDATE pension_auth.sessions SET revoked_at = now(), revoked_reason = $2 WHERE assignment_id = $1 AND revoked_at IS NULL',
      [assignmentId, reason],
    );
    liveCache.clear();
  },

  async find(sessionId: string): Promise<SessionEntity | null> {
    return sessions().findOne({ where: { id: sessionId } });
  },

  /** Registered as the lib session check: a revoked or expired session's access token is refused. */
  async assertLive(auth: AuthContext): Promise<void> {
    const hit = liveCache.get(auth.sessionId);
    if (hit && Date.now() - hit < LIVE_CACHE_MS) return;
    const s = await sessions().findOne({ where: { id: auth.sessionId }, select: { id: true, revokedAt: true, expiresAt: true, userId: true } });
    if (!s || s.revokedAt || s.expiresAt.getTime() < Date.now() || s.userId !== auth.userId) {
      throw new UnauthorizedError('session ended, please log in again', { code: 'E_TOKEN_INVALID' });
    }
    liveCache.set(auth.sessionId, Date.now());
  },
};
