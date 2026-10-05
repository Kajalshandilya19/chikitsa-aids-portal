/**
 * Masking for list views, exports and logs (rule R-PII-3). A list NEVER returns a full Aadhaar,
 * Jan Aadhaar, bank account or mobile number; only the detail endpoint guarded by
 * `pension:beneficiary.pii.unmask` does, and that call is audited.
 *
 * Every function accepts null/undefined and returns null for it, so callers never branch.
 */

const digitsOnly = (v: string): string => v.replace(/\D/g, '');

/** `XXXX XXXX 1234` */
export const maskAadhaar = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = digitsOnly(v);
  return d.length < 4 ? 'XXXX XXXX XXXX' : `XXXX XXXX ${d.slice(-4)}`;
};

/** `XXXXXX7890` (Jan Aadhaar family id is 10 digits) */
export const maskJanAadhaar = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = digitsOnly(v);
  return d.length < 4 ? 'XXXXXX' : `${'X'.repeat(Math.max(d.length - 4, 2))}${d.slice(-4)}`;
};

/** `XXXXXXXX4321` */
export const maskAccount = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = digitsOnly(v);
  return d.length < 4 ? 'XXXX' : `${'X'.repeat(Math.max(d.length - 4, 4))}${d.slice(-4)}`;
};

/** `98XXXXXX21`: enough to tell two numbers apart on a list, not enough to call. */
export const maskMobile = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = digitsOnly(v);
  return d.length <= 4 ? 'XXXX' : `${d.slice(0, 2)}${'X'.repeat(Math.max(d.length - 4, 2))}${d.slice(-2)}`;
};

/** `r****@gmail.com` */
export const maskEmail = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const [user = '', domain = ''] = v.split('@');
  return `${user.slice(0, 1)}****@${domain}`;
};

/** Last 4 characters, stored in plain beside an encrypted value so lists can mask without decrypting. */
export const last4 = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = digitsOnly(v);
  return d.length >= 4 ? d.slice(-4) : null;
};
