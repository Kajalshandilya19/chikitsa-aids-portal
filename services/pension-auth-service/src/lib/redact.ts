/**
 * Keys whose values never reach a log line (rule R-PII-4). Matching is on the key name,
 * case-insensitive, at any depth. When you add a new personal-data field ANYWHERE in the system,
 * add its key here in the same change (docs/FIELD_DICTIONARY.md marks every such field 🔒).
 */
export const DEFAULT_REDACT_KEYS = new Set<string>([
  // secrets and credentials
  'password',
  'current_password',
  'new_password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'mfa_token',
  'captcha_token',
  'captcha_answer',
  'authorization',
  'cookie',
  'set-cookie',
  'x-service-token',
  'otp',
  'totp_code',
  'mfa_secret',
  'secret',
  'otpauth_url',
  'apikey',
  'api_key',
  // people
  'full_name',
  'name',
  'patient_name',
  'guardian_name',
  'father_name',
  'mobile',
  'contact_number',
  'email',
  'address',
  'complete_address',
  'dob',
  'age',
  // identifiers (Aadhaar, Jan Aadhaar, ABHA, SOCH, ART, PPO, bank)
  'aadhaar',
  'aadhaar_number',
  'aadhaar_for_bank',
  'jan_aadhaar',
  'jan_aadhaar_member_id',
  'abha',
  'abha_number',
  'uid',
  'soch_uid',
  'beneficiary_id',
  'soch_beneficiary_id',
  'art_no',
  'art_number',
  'pre_art_no',
  'pid',
  'pid_number',
  'ppo_no',
  'ppo_number',
  'account_no',
  'account_number',
  'bank_account_number',
  // sensitive attributes and free text
  'caste',
  'category',
  'art_status',
  'remarks',
  'reason',
  'file_name',
  'original_name',
]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && (v.constructor === Object || Object.getPrototypeOf(v) === null);

export const redact = (value: unknown, keys: ReadonlySet<string> = DEFAULT_REDACT_KEYS, depth = 0): unknown => {
  if (depth > 8) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, keys, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = keys.has(k) || keys.has(k.toLowerCase()) ? '[REDACTED]' : redact(v, keys, depth + 1);
  }
  return out;
};
