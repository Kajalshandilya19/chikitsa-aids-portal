import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { IsNull, type EntityManager } from 'typeorm';
import { AppDataSource } from '../config/datasource';
import { OtpChallengeEntity, type OtpPurpose } from '../entities/otp-challenge.entity';
import { baseConfig } from '../lib/base-config';
import { AppError, RateLimitError } from '../lib/errors';
import { kv } from '../lib/kv';
import { smsClient } from '../clients/sms.client';

/**
 * SMS one-time passwords (docs/SECURITY.md S-AUTH-5): 6 digits, valid 10 minutes, single use,
 * 5 wrong attempts burn it, at most 3 sent per user per 10 minutes. Only an HMAC of the code is stored.
 */
const TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_S = 600;

const hashCode = (userId: string, purpose: OtpPurpose, code: string): string =>
  createHmac('sha256', Buffer.from(baseConfig().PII_HMAC_KEY, 'base64')).update(`otp\n${userId}\n${purpose}\n${code}`).digest('hex');

const repo = (em?: EntityManager) => (em ?? AppDataSource.manager).getRepository(OtpChallengeEntity);

export const otpService = {
  async issue(userId: string, mobile: string, purpose: OtpPurpose): Promise<{ expiresIn: number }> {
    if ((await kv().incr(`otp:send:${userId}`, SEND_WINDOW_S)) > MAX_SENDS) {
      throw new RateLimitError('Too many OTPs requested. Wait 10 minutes and try again.');
    }
    await AppDataSource.query(
      'UPDATE pension_auth.otp_challenges SET consumed_at = now() WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL',
      [userId, purpose],
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await repo().save(repo().create({ userId, purpose, codeHash: hashCode(userId, purpose, code), expiresAt: new Date(Date.now() + TTL_MS), attempts: 0, consumedAt: null }));
    await smsClient.send(mobile, `${code} is your Pension Portal OTP. It is valid for 10 minutes. Do not share it with anyone.`);
    return { expiresIn: TTL_MS / 1000 };
  },

  /** Consumes the OTP on success. Throws 400 E_OTP_INVALID / E_OTP_EXPIRED / E_OTP_LOCKED. */
  async verify(userId: string, purpose: OtpPurpose, code: string, em?: EntityManager): Promise<void> {
    const row = await repo(em).findOne({ where: { userId, purpose, consumedAt: IsNull() }, order: { createdAt: 'DESC' } });
    if (!row || row.consumedAt) throw new AppError(400, 'Invalid OTP. Request a new one.', { code: 'E_OTP_INVALID' });
    if (row.expiresAt.getTime() < Date.now()) throw new AppError(400, 'OTP expired. Request a new one.', { code: 'E_OTP_EXPIRED' });
    if (row.attempts >= MAX_ATTEMPTS) throw new AppError(400, 'Too many wrong attempts. Request a new OTP.', { code: 'E_OTP_LOCKED' });
    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(hashCode(userId, purpose, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      await repo(em).increment({ id: row.id }, 'attempts', 1);
      throw new AppError(400, 'Invalid OTP.', { code: 'E_OTP_INVALID' });
    }
    await repo(em).update({ id: row.id }, { consumedAt: new Date() });
  },
};
