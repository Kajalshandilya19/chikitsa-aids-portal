import { randomInt } from 'node:crypto';
import argon2 from 'argon2';
import { ValidationError } from '../lib/errors';

/**
 * Password hashing (argon2id, OWASP 2023 minimum parameters) and the context rules of V-006 that the
 * zod schema cannot check on its own (docs/SECURITY.md S-AUTH-1).
 */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
export const PASSWORD_HISTORY = 3;

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, OPTIONS);

export const verifyPassword = async (hash: string | null | undefined, plain: string): Promise<boolean> => {
  if (!hash) return false;
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
};

let dummyHash: Promise<string> | null = null;
/**
 * Spend the same time on an unknown User ID as on a wrong password, so response timing does not
 * reveal which User IDs exist.
 */
export const burnPasswordCheck = async (plain: string): Promise<void> => {
  dummyHash ??= hashPassword('dummy-password-for-timing-1A!');
  await verifyPassword(await dummyHash, plain);
};

/** V-006 context rules. Throws 422 E_PASSWORD_POLICY. */
export const checkPasswordContext = async (
  newPassword: string,
  userCode: string,
  previousHashes: readonly string[],
  currentHash: string | null,
): Promise<void> => {
  if (newPassword.toLowerCase().includes(userCode.toLowerCase())) {
    throw new ValidationError('Password must not contain your User ID (V-006)', { code: 'E_PASSWORD_POLICY' });
  }
  for (const h of [currentHash, ...previousHashes].filter((x): x is string => !!x)) {
    if (await verifyPassword(h, newPassword)) {
      throw new ValidationError(`Password must not be one of your last ${PASSWORD_HISTORY} passwords (V-006)`, { code: 'E_PASSWORD_POLICY' });
    }
  }
};

/** New history after a change: the old current hash goes in front, capped at PASSWORD_HISTORY. */
export const nextPasswordHistory = (currentHash: string | null, previous: readonly string[]): string[] =>
  [currentHash, ...previous].filter((x): x is string => !!x).slice(0, PASSWORD_HISTORY);

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '@#$%&*!?';
const pick = (set: string): string => set[randomInt(0, set.length)] as string;

/**
 * A temporary password that satisfies V-006 (12 chars: upper, lower, digit, symbol). Shown to the admin
 * ONCE; the user must replace it at first login (must_change_password + OTP).
 */
export const generateTemporaryPassword = (): string => {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  const all = UPPER + LOWER + DIGIT + SYMBOL;
  while (chars.length < 12) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
};
