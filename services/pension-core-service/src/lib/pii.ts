import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { ValueTransformer } from 'typeorm';

// PII at rest: AES-256-GCM authenticated encryption.
// Storage format: "v1:<base64(iv)>:<base64(authTag)>:<base64(ciphertext)>".
// Plaintext flowing through the rest of the app is never persisted unencrypted.
//
// For equality lookups + uniqueness constraints on encrypted columns, pair the
// transformer with a blind index column populated via `blindIndex(plain)`.

const ALGO = 'aes-256-gcm';
const PREFIX = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;
let cachedHmacKey: Buffer | null = null;

const decodeKey = (raw: string, expectedBytes: number, name: string): Buffer => {
  const buf = Buffer.from(raw, 'base64');
  if (buf.length < expectedBytes) {
    throw new Error(`${name} must decode to >= ${expectedBytes} bytes; got ${buf.length}`);
  }
  return buf.subarray(0, expectedBytes);
};

const getKey = (): Buffer => {
  if (cachedKey) return cachedKey;
  const raw = process.env['PII_ENCRYPTION_KEY'];
  if (!raw) throw new Error('PII_ENCRYPTION_KEY is required (base64-encoded 32 bytes)');
  cachedKey = decodeKey(raw, KEY_BYTES, 'PII_ENCRYPTION_KEY');
  return cachedKey;
};

const getHmacKey = (): Buffer => {
  if (cachedHmacKey) return cachedHmacKey;
  const raw = process.env['PII_HMAC_KEY'];
  if (!raw) throw new Error('PII_HMAC_KEY is required (base64-encoded >= 32 bytes)');
  cachedHmacKey = decodeKey(raw, KEY_BYTES, 'PII_HMAC_KEY');
  return cachedHmacKey;
};

export const resetPiiKeysForTests = (): void => {
  cachedKey = null;
  cachedHmacKey = null;
};

export const encryptPii = (plaintext: string): string => {
  if (typeof plaintext !== 'string') throw new Error('encryptPii expects a string');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
};

export const decryptPii = (payload: string): string => {
  if (typeof payload !== 'string') throw new Error('decryptPii expects a string');
  const parts = payload.split(':');
  // Tolerate legacy plaintext rows during migration: return as-is when prefix is missing.
  if (parts.length !== 4 || parts[0] !== PREFIX) return payload;
  const iv = Buffer.from(parts[1] ?? '', 'base64');
  const tag = Buffer.from(parts[2] ?? '', 'base64');
  const enc = Buffer.from(parts[3] ?? '', 'base64');
  if (iv.length !== IV_BYTES) throw new Error('decryptPii: bad iv length');
  if (tag.length !== TAG_BYTES) throw new Error('decryptPii: bad tag length');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
};

export const isEncryptedPii = (value: string): boolean => {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 4 && parts[0] === PREFIX;
};

// Canonical form behind every deterministic index: trim, collapse runs of internal whitespace to
// a single space, lowercase. The collapse matters because "Raj  Kumar" is typed as readily as
// "Raj Kumar": without it the two hash differently and the search silently returns nothing.
export const normalizeForIndex = (plaintext: string): string =>
  plaintext.trim().toLowerCase().replace(/\s+/g, ' ');

// Deterministic HMAC-SHA256 over the normalized value, for case-insensitive matching.
// Use this for blind index columns paired with encrypted columns.
export const blindIndex = (plaintext: string): string => {
  if (typeof plaintext !== 'string') throw new Error('blindIndex expects a string');
  return createHmac('sha256', getHmacKey()).update(normalizeForIndex(plaintext)).digest('hex');
};

// Prefix blind indexes: enables progressive ("half text") search over encrypted columns.
// Emits the HMAC of every normalized prefix from MIN..MAX chars plus the full value, for
// storage in a `text[]` column (GIN-indexed). The search side hashes the raw query once via
// `blindIndex(query)` and matches with `... = ANY(<col>_prefixes)`: a query shorter than MIN
// or longer than MAX only matches the full value, exactly like the old exact-match behaviour.
// Trade-off (accepted): prefix tokens reveal shared-prefix relationships between rows to a
// DB-level attacker: they never reveal the plaintext itself.
export const PREFIX_INDEX_MIN = 2;
export const PREFIX_INDEX_MAX = 12;

export const prefixBlindIndexes = (
  plaintext: string,
  minLen: number = PREFIX_INDEX_MIN,
  maxLen: number = PREFIX_INDEX_MAX,
): string[] => {
  if (typeof plaintext !== 'string') throw new Error('prefixBlindIndexes expects a string');
  const normalized = normalizeForIndex(plaintext);
  if (!normalized) return [];
  const tokens = new Set<string>();
  const upper = Math.min(normalized.length, maxLen);
  for (let len = Math.min(minLen, normalized.length); len <= upper; len++) {
    tokens.add(blindIndex(normalized.slice(0, len)));
  }
  tokens.add(blindIndex(normalized)); // full value always matches, even beyond maxLen
  return [...tokens];
};

// ---- Name search -----------------------------------------------------------------------------
// A person's name is indexed WORD-wise, not as one string. "Raj Kumar Sharma" has to be findable
// by "raj", "sharma", "kumar sharma" or the whole thing, in any order and regardless of which
// column each part landed in: so every word contributes its own prefix tokens. The joined name
// contributes its prefixes too, so a query straddling a word boundary ("raj ku") still matches.
// Pass every part of the name (first, middle, last) in one call: the tokens are a flat set and
// the search never needs to know which part a word came from.
export const nameBlindIndexes = (...parts: Array<string | null | undefined>): string[] => {
  const words: string[] = [];
  for (const part of parts) {
    if (typeof part === 'string' && normalizeForIndex(part)) words.push(...normalizeForIndex(part).split(' '));
  }
  if (words.length === 0) return [];
  const tokens = new Set<string>();
  for (const word of words) for (const t of prefixBlindIndexes(word)) tokens.add(t);
  if (words.length > 1) for (const t of prefixBlindIndexes(words.join(' '))) tokens.add(t);
  return [...tokens];
};

// Query side of `nameBlindIndexes`: one token per word the user typed. EVERY token must be present
// on the row, so callers AND them through array containment: `col @> ARRAY[...]::text[]`: which
// also makes word order irrelevant. Capped so a pathological query can't build unbounded SQL.
export const NAME_SEARCH_MAX_WORDS = 6;

export const nameSearchTokens = (query: string): string[] => {
  if (typeof query !== 'string') throw new Error('nameSearchTokens expects a string');
  const normalized = normalizeForIndex(query);
  if (!normalized) return [];
  const words = [...new Set(normalized.split(' '))].slice(0, NAME_SEARCH_MAX_WORDS);
  return words.map((w) => blindIndex(w));
};

export const piiTransformer: ValueTransformer = {
  to: (value: unknown): string | null | undefined => {
    if (value === null || value === undefined) return value as null | undefined;
    if (typeof value !== 'string') throw new Error('piiTransformer.to expects a string');
    return encryptPii(value);
  },
  from: (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    return decryptPii(value);
  },
};
