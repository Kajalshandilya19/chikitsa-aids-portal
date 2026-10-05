import { z } from 'zod';

/**
 * THE validation catalogue (rule R-VAL-1). Every field of every DTO and every form is built from a
 * schema in this file. Each schema carries a rule id `V-0xx` that docs/FIELD_DICTIONARY.md and
 * docs/VALIDATION_RULES.md refer to, and that the unit tests (UT-VAL-*) are named after.
 *
 * This file is byte-identical in the three services AND in web/pension-web/src/lib/shared/, so the
 * browser rejects exactly what the server rejects (rule R-VAL-2). It imports nothing but zod: no node
 * modules, no app code.
 *
 * Do NOT write an inline regex or a `.min()` in a DTO or a form. If a rule is missing, add it here,
 * give it the next V- number, document it, test it, then run scripts/sync-lib.sh.
 *
 * Normalisation (trim, collapse spaces, upper/lower case, strip separators) happens INSIDE the schema
 * with `.overwrite()`, so the value that reaches the database is always the canonical one.
 */

// ---------------------------------------------------------------- shared patterns

/** Any markup character. Free-text fields refuse `<` and `>` outright (stricter than lib/xss-guard). */
const NO_MARKUP = /^[^<>]*$/;
const collapse = (s: string) => s.replace(/\s+/g, ' ');
const stripSeparators = (s: string) => s.replace(/[\s-]/g, '');

const msg = (id: string, text: string) => `${text} (${id})`;

// ---------------------------------------------------------------- V-001..V-006 people and accounts

/** V-001 Person name: 2-100 chars; letters of any script (Hindi too), space, dot, apostrophe, hyphen. No digits. */
export const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;
export const personName = z
  .string()
  .trim()
  .overwrite(collapse)
  .min(2, msg('V-001', 'Name must be at least 2 characters'))
  .max(100, msg('V-001', 'Name must be at most 100 characters'))
  .regex(NAME_RE, msg('V-001', 'Name may contain only letters, spaces, dot, apostrophe and hyphen'));

/** V-002 User ID (login): 4-32 chars, lowercase letters, digits, dot, underscore, hyphen; starts with a letter. */
export const USER_CODE_RE = /^[a-z][a-z0-9._-]{3,31}$/;
export const userCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USER_CODE_RE, msg('V-002', 'User ID must be 4 to 32 characters: letters, digits, dot, underscore or hyphen, starting with a letter'));

/** V-003 Center code: 3-16 chars, uppercase letters, digits, hyphen; starts with a letter (e.g. RJ001). */
export const CENTER_CODE_RE = /^[A-Z][A-Z0-9-]{2,15}$/;
export const centerCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(CENTER_CODE_RE, msg('V-003', 'Center code must be 3 to 16 characters: letters, digits or hyphen, starting with a letter'));

/** V-004 Indian mobile: stored as 10 digits starting 6-9. Spaces, hyphens, +91 and a leading 0 are removed first. */
export const MOBILE_RE = /^[6-9]\d{9}$/;
export const normalizeMobile = (s: string): string => {
  const d = s.replace(/[\s()-]/g, '');
  if (/^\+91\d{10}$/.test(d)) return d.slice(3);
  if (/^91\d{10}$/.test(d)) return d.slice(2);
  if (/^0\d{10}$/.test(d)) return d.slice(1);
  return d;
};
export const mobile = z.string().trim().overwrite(normalizeMobile).regex(MOBILE_RE, msg('V-004', 'Mobile number must be 10 digits starting with 6, 7, 8 or 9'));

/** V-005 Email: standard format, at most 254 chars, stored lowercase. */
export const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, msg('V-005', 'Email must be at most 254 characters'))
  .pipe(z.email(msg('V-005', 'Enter a valid email address')));

/**
 * V-006 Password policy: 10-64 chars, at least one uppercase, one lowercase, one digit and one symbol,
 * no leading or trailing space. The "must not contain the User ID" and "not one of the last 3" checks
 * need context and live in auth-service (password.service.ts), with the same rule id.
 */
export const password = z
  .string()
  .min(10, msg('V-006', 'Password must be at least 10 characters'))
  .max(64, msg('V-006', 'Password must be at most 64 characters'))
  .refine((s) => s === s.trim(), msg('V-006', 'Password must not start or end with a space'))
  .refine((s) => /[A-Z]/.test(s), msg('V-006', 'Password needs an uppercase letter'))
  .refine((s) => /[a-z]/.test(s), msg('V-006', 'Password needs a lowercase letter'))
  .refine((s) => /\d/.test(s), msg('V-006', 'Password needs a digit'))
  .refine((s) => /[^A-Za-z0-9]/.test(s), msg('V-006', 'Password needs a symbol'));

/** Login form password: only presence and length (the policy is checked when a password is SET, not at login). */
export const loginPassword = z.string().min(1, 'Enter your password').max(128);

// ---------------------------------------------------------------- V-007..V-012 identity and bank

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Verhoeff checksum over a digit string (the last digit is the check digit). */
export const verhoeffValid = (digits: string): boolean => {
  if (!/^\d+$/.test(digits)) return false;
  let c = 0;
  const rev = digits.split('').reverse();
  for (let i = 0; i < rev.length; i++) {
    const row = VERHOEFF_P[i % 8] as number[];
    c = (VERHOEFF_D[c] as number[])[row[Number(rev[i])] as number] as number;
  }
  return c === 0;
};

/** V-007 Aadhaar: 12 digits, first digit 2-9, valid Verhoeff check digit, not all one digit. Spaces and hyphens removed first. */
export const AADHAAR_RE = /^[2-9]\d{11}$/;
export const isValidAadhaar = (v: string): boolean => {
  const d = stripSeparators(v);
  return AADHAAR_RE.test(d) && !/^(\d)\1{11}$/.test(d) && verhoeffValid(d);
};
export const aadhaar = z
  .string()
  .trim()
  .overwrite(stripSeparators)
  .regex(AADHAAR_RE, msg('V-007', 'Aadhaar must be 12 digits and cannot start with 0 or 1'))
  .refine(isValidAadhaar, msg('V-007', 'This Aadhaar number is not valid (check digit mismatch)'));

/** V-008 Jan Aadhaar family ID: exactly 10 digits. */
export const janAadhaarFamilyId = z
  .string()
  .trim()
  .overwrite(stripSeparators)
  .regex(/^\d{10}$/, msg('V-008', 'Jan Aadhaar family ID must be exactly 10 digits'));

/** V-009 Jan Aadhaar member ID: exactly 11 digits. */
export const janAadhaarMemberId = z
  .string()
  .trim()
  .overwrite(stripSeparators)
  .regex(/^\d{11}$/, msg('V-009', 'Jan Aadhaar member ID must be exactly 11 digits'));

/** V-010 IFSC: 11 chars, 4 letters, then 0, then 6 letters or digits. Stored uppercase. */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(IFSC_RE, msg('V-010', 'IFSC must be 11 characters: 4 letters, then 0, then 6 letters or digits'));

/** V-011 Bank account number: 9-18 digits, not all zeros. */
export const bankAccountNumber = z
  .string()
  .trim()
  .overwrite(stripSeparators)
  .regex(/^\d{9,18}$/, msg('V-011', 'Account number must be 9 to 18 digits'))
  .refine((s) => !/^0+$/.test(s), msg('V-011', 'Account number cannot be all zeros'));

/** V-012 Bank name: 2-100 chars; letters, digits, space and . & ( ) ' - */
export const bankName = z
  .string()
  .trim()
  .overwrite(collapse)
  .min(2, msg('V-012', 'Bank name must be at least 2 characters'))
  .max(100, msg('V-012', 'Bank name must be at most 100 characters'))
  .regex(/^[\p{L}\p{M}0-9 .&()'-]+$/u, msg('V-012', 'Bank name may contain only letters, digits, spaces and . & ( ) \' -'));

// ---------------------------------------------------------------- V-013..V-015 free text

/** V-013 Address: 5-300 chars; letters, digits, space, newline and , . - / # ( ) ' : No markup. */
export const address = z
  .string()
  .trim()
  .min(5, msg('V-013', 'Address must be at least 5 characters'))
  .max(300, msg('V-013', 'Address must be at most 300 characters'))
  .regex(/^[\p{L}\p{M}0-9 \n,./#()':-]+$/u, msg('V-013', 'Address may contain only letters, digits, spaces and , . - / # ( ) \' :'));

/** V-014 Remarks (optional free text): at most 500 chars, no < or >. Empty string becomes null. */
export const remarks = z
  .string()
  .trim()
  .max(500, msg('V-014', 'Remarks must be at most 500 characters'))
  .regex(NO_MARKUP, msg('V-014', 'Remarks must not contain < or >'))
  .transform((s) => (s.length === 0 ? null : s));

/** V-015 Reason (mandatory for return and reject): 10-500 chars, no < or >. */
export const reason = z
  .string()
  .trim()
  .min(10, msg('V-015', 'Reason must be at least 10 characters'))
  .max(500, msg('V-015', 'Reason must be at most 500 characters'))
  .regex(NO_MARKUP, msg('V-015', 'Reason must not contain < or >'));

// ---------------------------------------------------------------- V-016..V-020 dates, numbers, enums

/** Today's date in India (YYYY-MM-DD), independent of the machine's timezone. */
export const todayIst = (): string => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

const isRealDate = (s: string): boolean => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

/** V-016 Date: `YYYY-MM-DD`, a real calendar date, between 1990-01-01 and today (IST). For past events only. */
export const pastDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, msg('V-016', 'Date must be in YYYY-MM-DD format'))
  .refine(isRealDate, msg('V-016', 'Date is not a real calendar date'))
  .refine((s) => s >= '1990-01-01', msg('V-016', 'Date cannot be before 1990-01-01'))
  .refine((s) => s <= todayIst(), msg('V-016', 'Date cannot be in the future'));

/** V-017 Age in whole years: 0-120. */
export const age = z.coerce
  .number({ error: msg('V-017', 'Age must be a number') })
  .int(msg('V-017', 'Age must be a whole number'))
  .min(0, msg('V-017', 'Age cannot be negative'))
  .max(120, msg('V-017', 'Age must be at most 120'));

/** V-018 Sex. Mapping from SOCH spellings lives in data-service (soch-columns.ts). */
export const SEX_VALUES = ['MALE', 'FEMALE', 'TRANSGENDER'] as const;
export const sex = z.enum(SEX_VALUES, { error: msg('V-018', 'Sex must be Male, Female or Transgender') });

/** V-019 Category / caste group. PLACEHOLDER list until the department confirms (docs/OPEN_QUESTIONS.md Q-07). */
export const CATEGORY_VALUES = ['GENERAL', 'EWS', 'OBC', 'MBC', 'SC', 'ST'] as const;
export const category = z.enum(CATEGORY_VALUES, { error: msg('V-019', 'Select a valid category') });

/** V-020 Consent: YES or NO. Submission requires YES (business rule BR-11). */
export const CONSENT_VALUES = ['YES', 'NO'] as const;
export const consent = z.enum(CONSENT_VALUES, { error: msg('V-020', 'Consent must be Yes or No') });

// ---------------------------------------------------------------- V-021..V-026 SOCH and health identifiers

/**
 * SOCH identifier formats are NOT published by NACO (docs/OPEN_QUESTIONS.md Q-02). These are
 * deliberately permissive PLACEHOLDERS: letters, digits, slash and hyphen, bounded length. Tighten
 * them once a real SOCH export is available.
 */
const sochId = (id: string, label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(new RegExp(`^[A-Z0-9/-]{${min},${max}}$`), msg(id, `${label} must be ${min} to ${max} characters: letters, digits, / or -`));

/** V-021 SOCH UID */
export const sochUid = sochId('V-021', 'UID', 4, 30);
/** V-022 ART registration number (changes when a patient transfers; never a key) */
export const artNumber = sochId('V-022', 'ART number', 3, 30);
/** V-023 Pre-ART number */
export const preArtNumber = sochId('V-023', 'Pre-ART number', 3, 30);
/** V-024 PID number (NACO FAQ mentions a 23-character PID; older records may differ) */
export const pidNumber = sochId('V-024', 'PID number', 5, 30);
/** V-025 SOCH Beneficiary ID */
export const sochBeneficiaryId = sochId('V-025', 'Beneficiary ID', 1, 30);

/** V-026 ABHA number: 14 digits (hyphens allowed in input, stored without). */
export const abhaNumber = z
  .string()
  .trim()
  .overwrite(stripSeparators)
  .regex(/^\d{14}$/, msg('V-026', 'ABHA number must be 14 digits'));

// ---------------------------------------------------------------- V-027..V-032 codes, search, paging

/** V-027 LGD district code: whole number 1-99999. */
export const lgdCode = z.coerce.number().int(msg('V-027', 'LGD code must be a whole number')).min(1).max(99999, msg('V-027', 'LGD code must be at most 99999'));

/** V-028 TOTP code from an authenticator app: 6 digits. */
export const totpCode = z.string().trim().regex(/^\d{6}$/, msg('V-028', 'Enter the 6 digit code from your authenticator app'));

/** V-029 SMS OTP: 6 digits. */
export const otpCode = z.string().trim().regex(/^\d{6}$/, msg('V-029', 'Enter the 6 digit OTP'));

/** V-030 Search text: 1-100 chars, no < or >. */
export const searchText = z
  .string()
  .trim()
  .overwrite(collapse)
  .min(1, msg('V-030', 'Type something to search'))
  .max(100, msg('V-030', 'Search text must be at most 100 characters'))
  .regex(NO_MARKUP, msg('V-030', 'Search text must not contain < or >'));

/** V-031 Paging: page 1-10000, limit 1-100 (default 1 and 20). */
export const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

/** V-032 UUID path or body id. */
export const uuid = z.uuid(msg('V-032', 'Invalid id'));

// ---------------------------------------------------------------- V-033..V-040 money, labels, enums

/** V-033 Amount in rupees: more than 0, at most 1,00,000, at most 2 decimals. */
export const amountRupees = z.coerce
  .number({ error: msg('V-033', 'Amount must be a number') })
  .positive(msg('V-033', 'Amount must be more than 0'))
  .max(100_000, msg('V-033', 'Amount must be at most 1,00,000'))
  .refine((n) => Math.round(n * 100) === n * 100, msg('V-033', 'Amount can have at most 2 decimal places'));

/** V-034 Payment period: `YYYY-MM`. */
export const paymentPeriod = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, msg('V-034', 'Payment period must be in YYYY-MM format'));

/** V-035 Hindi label: 1-150 chars, Devanagari letters, digits, spaces and . , ( ) ' - */
export const hindiText = z
  .string()
  .trim()
  .overwrite(collapse)
  .min(1, msg('V-035', 'Hindi name is required'))
  .max(150, msg('V-035', 'Hindi name must be at most 150 characters'))
  .regex(/^[ऀ-ॿ0-9 .,()'-]+$/, msg('V-035', 'Hindi name may contain only Devanagari letters, digits, spaces and . , ( ) \' -'));

/** V-036 PIN code: 6 digits, not starting with 0. */
export const pincode = z.string().trim().regex(/^[1-9]\d{5}$/, msg('V-036', 'PIN code must be 6 digits and cannot start with 0'));

/** V-037 PPO number: 6-40 chars, uppercase letters, digits, / and -. */
export const ppoNumber = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/-]{6,40}$/, msg('V-037', 'PPO number must be 6 to 40 characters: letters, digits, / or -'));

/** V-038 English label (center name, role name, bank branch): 2-150 chars; letters, digits, space and . , ( ) ' / & - */
export const englishLabel = z
  .string()
  .trim()
  .overwrite(collapse)
  .min(2, msg('V-038', 'Name must be at least 2 characters'))
  .max(150, msg('V-038', 'Name must be at most 150 characters'))
  .regex(/^[A-Za-z0-9 .,()'/&-]+$/, msg('V-038', 'Name may contain only English letters, digits, spaces and . , ( ) \' / & -'));

/** V-039 ART status (NACO ART guidelines 2021 §3.1.3). */
export const ART_STATUS_VALUES = [
  'ON_ART',
  'MISSED',
  'ON_ART_LFU',
  'PRE_ART_LFU',
  'OPTED_OUT',
  'STOPPED',
  'DIED',
  'TRANSFERRED_OUT',
  'TRANSFERRED_IN',
  'IN_TRANSIT',
  'LINKED_OUT',
] as const;
export const artStatus = z.enum(ART_STATUS_VALUES, { error: msg('V-039', 'Unknown ART status') });

/** V-040 Center type. ART = ART Centre, LAC = Link ART Centre, COE = Centre of Excellence. */
export const CENTER_TYPE_VALUES = ['ART', 'LAC', 'COE', 'OTHER'] as const;
export const centerType = z.enum(CENTER_TYPE_VALUES, { error: msg('V-040', 'Center type must be ART, LAC, COE or OTHER') });

/** V-041 Captcha answer: the sum of two digits 1-9, so 1 or 2 digits. */
export const captchaAnswer = z.string().trim().regex(/^\d{1,2}$/, msg('V-041', 'Enter the captcha answer as a number'));

// ---------------------------------------------------------------- helpers

/** Wraps a schema so an empty string or null becomes null (for optional form fields). */
export const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

/** `true|false` from a query string. */
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
