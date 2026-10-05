import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';
import { config } from '../config';

/** RFC 6238 TOTP (30 s, 6 digits) for STATE and DISTRICT roles (docs/SECURITY.md S-AUTH-4). */
export const totpService = {
  newSecret(): string {
    return generateSecret();
  },

  /** Label is the User ID only: no name, mobile or role, since the QR may be photographed. */
  otpauthUrl(userCode: string, secret: string): string {
    return generateURI({ strategy: 'totp', issuer: config().MFA_ISSUER, label: userCode, secret });
  },

  verify(secret: string, code: string): boolean {
    if (!/^\d{6}$/.test(code)) return false;
    try {
      const r = verifySync({ strategy: 'totp', secret, token: code });
      return Boolean(r && (r as { valid?: boolean }).valid);
    } catch {
      return false;
    }
  },

  /** Tests and the local dev helper only. */
  currentCode(secret: string): string {
    return generateSync({ strategy: 'totp', secret });
  },
};
