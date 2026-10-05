import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { RateLimitError } from './errors';
import { isInternalCall } from './internal-call';
import { redisClient } from './kv';

/**
 * Rate limiters (docs/SECURITY.md S-RL-1..3). Every limiter is keyed PER CALLER, never globally: a
 * single shared bucket behind a proxy locks the whole state out at once (it happened on Chikitsa Lite).
 *   - `perUser`: logged-in routes, keyed by user id (falls back to IP before authentication).
 *   - `perIdentifier`: login / forgot password, keyed by IP + the identifier typed.
 * Calls carrying a VALID service token skip the limiter (sibling services share a few node IPs).
 * Counters live in Redis so every replica enforces the same budget.
 */

export interface LimiterOptions {
  /** Unique per limiter: becomes part of the Redis key. */
  name: string;
  windowMs: number;
  limit: number;
}

const store = (name: string) => {
  const client = redisClient();
  if (!client) return undefined; // local only: in-process memory store
  return new RedisStore({
    prefix: `rl:${name}:`,
    sendCommand: (command: string, ...args: string[]) => client.call(command, ...args) as Promise<number>,
  });
};

const build = (opts: LimiterOptions, keyGenerator: (req: Request) => string): RequestHandler =>
  rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: store(opts.name),
    keyGenerator,
    skip: (req) => isInternalCall(req),
    handler: (_req, _res, next) => next(new RateLimitError()),
  });

const userIdOf = (req: Request): string | undefined => {
  const auth = (req.res?.locals as { auth?: { userId?: string } } | undefined)?.auth;
  return auth?.userId;
};

export const perUser = (opts: LimiterOptions): RequestHandler =>
  build(opts, (req) => {
    const id = userIdOf(req);
    return id ? `u:${id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`;
  });

export const perIdentifier = (opts: LimiterOptions, field = 'user_code'): RequestHandler =>
  build(opts, (req) => {
    const raw = (req.body as Record<string, unknown> | undefined)?.[field];
    const ident = typeof raw === 'string' ? raw.trim().toLowerCase().slice(0, 64) : '';
    return `ip:${ipKeyGenerator(req.ip ?? '')}|id:${ident}`;
  });
