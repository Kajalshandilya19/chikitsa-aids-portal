import Redis from 'ioredis';
import { baseConfig } from './base-config';

/**
 * Small shared key-value store: captcha nonces, OTP attempt counters, rate-limit buckets.
 *
 * Redis when REDIS_HOST is set (always, outside local), so every replica of a service sees the same
 * counters. Without Redis a per-process Map is used, which is only correct for ONE process; that is
 * why it is refused unless APP_ENV=local (docs/SECURITY.md S-RL-2).
 */
export interface KvStore {
  /** Sets the key only if it does not exist. true = this call set it. */
  setOnce(key: string, ttlSeconds: number): Promise<boolean>;
  /** Increments and returns the new value; the TTL is set when the key is created. */
  incr(key: string, ttlSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

class MemoryKv implements KvStore {
  private readonly map = new Map<string, { value: string; exp: number }>();

  private live(key: string): { value: string; exp: number } | undefined {
    const hit = this.map.get(key);
    if (hit && hit.exp < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit;
  }

  async setOnce(key: string, ttl: number): Promise<boolean> {
    if (this.live(key)) return false;
    this.map.set(key, { value: '1', exp: Date.now() + ttl * 1000 });
    if (this.map.size > 20_000) this.sweep();
    return true;
  }

  async incr(key: string, ttl: number): Promise<number> {
    const hit = this.live(key);
    const next = (hit ? Number(hit.value) : 0) + 1;
    this.map.set(key, { value: String(next), exp: hit?.exp ?? Date.now() + ttl * 1000 });
    return next;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    this.map.set(key, { value, exp: Date.now() + ttl * 1000 });
  }

  async del(key: string): Promise<void> {
    this.map.delete(key);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [k, v] of this.map) if (v.exp < now) this.map.delete(k);
  }
}

class RedisKv implements KvStore {
  constructor(private readonly client: Redis) {}

  async setOnce(key: string, ttl: number): Promise<boolean> {
    return (await this.client.set(key, '1', 'EX', ttl, 'NX')) === 'OK';
  }

  async incr(key: string, ttl: number): Promise<number> {
    const n = await this.client.incr(key);
    if (n === 1) await this.client.expire(key, ttl);
    return n;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl: number): Promise<void> {
    await this.client.set(key, value, 'EX', ttl);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}

let client: Redis | null | undefined;
let store: KvStore | undefined;

/** The raw ioredis client (null without Redis). Used by the rate limiter's store. */
export const redisClient = (): Redis | null => {
  if (client !== undefined) return client;
  const cfg = baseConfig();
  if (!cfg.REDIS_HOST) {
    if (cfg.APP_ENV !== 'local') throw new Error('REDIS_HOST is required outside APP_ENV=local (S-RL-2)');
    client = null;
    return client;
  }
  client = new Redis({
    host: cfg.REDIS_HOST,
    port: cfg.REDIS_PORT,
    password: cfg.REDIS_PASSWORD || undefined,
    keyPrefix: 'hp:',
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  return client;
};

export const kv = (): KvStore => {
  if (!store) {
    const c = redisClient();
    store = c ? new RedisKv(c) : new MemoryKv();
  }
  return store;
};

/** Test seam: forces the in-memory store. */
export const useMemoryKvForTests = (): void => {
  client = null;
  store = new MemoryKv();
};

export const closeKv = async (): Promise<void> => {
  if (client) await client.quit();
  client = undefined;
  store = undefined;
};
