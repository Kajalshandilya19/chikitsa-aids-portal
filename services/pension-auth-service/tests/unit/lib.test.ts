import { issueAccessToken, verifyAccessToken, type AuthContext } from '../../src/lib/access-token';
import { verifyCaptcha, newCaptcha } from '../../src/lib/captcha';
import { getServiceToken, isInternalCall, verifyServiceToken } from '../../src/lib/internal-call';
import { useMemoryKvForTests } from '../../src/lib/kv';
import { last4, maskAadhaar, maskAccount, maskEmail, maskMobile } from '../../src/lib/mask';
import { blindIndex, decryptPii, encryptPii, isEncryptedPii, nameBlindIndexes, nameSearchTokens } from '../../src/lib/pii';
import { redact } from '../../src/lib/redact';
import { assertInScope, isInScope } from '../../src/lib/scope';
import { containsXss } from '../../src/lib/xss-guard';
import { assertSafeProfile, baseEnvSchema } from '../../src/lib/base-config';

const ctx = (over: Partial<AuthContext> = {}): AuthContext => ({
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  userCode: 'worker.rj001',
  name: 'Test',
  assignmentId: '33333333-3333-4333-8333-333333333333',
  roleId: '44444444-4444-4444-8444-444444444444',
  roleCode: 'center_worker',
  scope: 'CENTER',
  districtId: 'd1',
  centerId: 'c1',
  centerCode: 'RJ001',
  mustChangePassword: false,
  ...over,
});

beforeAll(() => useMemoryKvForTests());

describe('lib/pii (R-PII-1)', () => {
  test('UT-LIB-001 encrypt then decrypt returns the plaintext; ciphertext is prefixed and random', () => {
    const a = encryptPii('9876543210');
    const b = encryptPii('9876543210');
    expect(isEncryptedPii(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(decryptPii(a)).toBe('9876543210');
  });

  test('UT-LIB-002 blind index is deterministic and normalised', () => {
    expect(blindIndex('Asha  Devi')).toBe(blindIndex(' asha devi '));
    expect(blindIndex('a')).not.toBe(blindIndex('b'));
  });

  test('UT-LIB-003 name search: every typed word must be a token of the stored name', () => {
    const tokens = nameBlindIndexes('Asha Devi Sharma');
    for (const t of nameSearchTokens('sharma ash')) expect(tokens).toContain(t);
  });
});

describe('lib/mask (R-PII-3)', () => {
  test('UT-LIB-004 masks keep only the last digits', () => {
    expect(maskAadhaar('234123412346')).toBe('XXXX XXXX 2346');
    expect(maskAccount('123456789012')).toBe('XXXXXXXX9012');
    expect(maskMobile('9876543210')).toBe('98XXXXXX10');
    expect(maskEmail('asha@example.org')).toBe('a****@example.org');
    expect(last4('9876543210')).toBe('3210');
    expect(maskAadhaar(null)).toBeNull();
  });
});

describe('lib/redact (R-PII-4)', () => {
  test('UT-LIB-005 personal keys are redacted at any depth', () => {
    const r = redact({ user_code: 'x', mobile: '9876543210', nested: { aadhaar: '1', ok: 1 }, list: [{ password: 'p' }] }) as Record<string, unknown>;
    expect(r['mobile']).toBe('[REDACTED]');
    expect((r['nested'] as Record<string, unknown>)['aadhaar']).toBe('[REDACTED]');
    expect((r['nested'] as Record<string, unknown>)['ok']).toBe(1);
    expect(((r['list'] as unknown[])[0] as Record<string, unknown>)['password']).toBe('[REDACTED]');
  });
});

describe('lib/access-token and internal-call (R-API-6)', () => {
  test('UT-LIB-006 an access token round-trips its claims', () => {
    const { token } = issueAccessToken(ctx());
    expect(verifyAccessToken(token)).toEqual(ctx());
  });

  test('UT-LIB-007 a service token is NOT accepted as a user token, and the reverse', () => {
    const svc = getServiceToken();
    expect(() => verifyAccessToken(svc)).toThrow();
    const { token } = issueAccessToken(ctx());
    expect(() => verifyServiceToken(token)).toThrow();
    expect(isInternalCall({ headers: { 'x-service-token': svc } })).toBe(true);
    expect(isInternalCall({ headers: { 'x-service-token': token } })).toBe(false);
    expect(isInternalCall({ headers: {} })).toBe(false);
  });

  test('UT-LIB-008 a tampered token is refused', () => {
    const { token } = issueAccessToken(ctx());
    const parts = token.split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: 'x', sc: 'STATE' })).toString('base64url')}.${parts[2]}`;
    expect(() => verifyAccessToken(forged)).toThrow();
  });
});

describe('lib/scope (R-SCOPE-1..3)', () => {
  const row = { districtId: 'd1', centerId: 'c1' };
  test('UT-SCOPE-001 STATE sees everything, DISTRICT its district, CENTER its center', () => {
    expect(isInScope(ctx({ scope: 'STATE', districtId: null, centerId: null }), row)).toBe(true);
    expect(isInScope(ctx({ scope: 'DISTRICT', centerId: null }), row)).toBe(true);
    expect(isInScope(ctx({ scope: 'DISTRICT', districtId: 'd2', centerId: null }), row)).toBe(false);
    expect(isInScope(ctx(), row)).toBe(true);
    expect(isInScope(ctx({ centerId: 'c2' }), row)).toBe(false);
  });

  test('UT-SCOPE-002 fail closed: a CENTER caller without a center sees nothing', () => {
    expect(isInScope(ctx({ centerId: null }), row)).toBe(false);
    expect(isInScope(ctx({ scope: 'DISTRICT', districtId: null }), row)).toBe(false);
  });

  test('UT-SCOPE-003 out of scope is reported as 404, not 403', () => {
    expect(() => assertInScope(ctx({ centerId: 'c2' }), row, 'beneficiary')).toThrow(expect.objectContaining({ status: 404 }));
  });
});

describe('lib/captcha (S-AUTH-3)', () => {
  test('UT-LIB-009 the image carries no readable text; local dev_answer passes once, then the token is spent', async () => {
    const c = newCaptcha();
    const svg = Buffer.from(c.image.split(',')[1] as string, 'base64').toString();
    expect(svg).not.toMatch(/<text/);
    expect(c.dev_answer).toMatch(/^\d{1,2}$/);
    await expect(verifyCaptcha(c.token, c.dev_answer)).resolves.toBeUndefined();
    await expect(verifyCaptcha(c.token, c.dev_answer)).rejects.toMatchObject({ code: 'E_CAPTCHA_USED' });
  });

  test('UT-LIB-010 a wrong answer burns the challenge: the right answer afterwards is refused', async () => {
    const c = newCaptcha();
    const wrong = String((Number(c.dev_answer) % 18) + 1);
    await expect(verifyCaptcha(c.token, wrong)).rejects.toMatchObject({ code: 'E_CAPTCHA' });
    await expect(verifyCaptcha(c.token, c.dev_answer)).rejects.toMatchObject({ code: 'E_CAPTCHA_USED' });
    await expect(verifyCaptcha('1.2.3', '5')).rejects.toMatchObject({ code: 'E_CAPTCHA' });
  });
});

describe('lib/xss-guard', () => {
  test('UT-LIB-011 script markup is detected, also when encoded; ordinary text passes', () => {
    expect(containsXss('<script>alert(1)</script>')).toBe(true);
    expect(containsXss('%3Cscript%3E')).toBe(true);
    expect(containsXss('javascript:alert(1)')).toBe(true);
    expect(containsXss('BP < 120 and O\'Brien')).toBe(false);
  });
});

describe('lib/base-config (S-CFG-1..4)', () => {
  test('UT-LIB-012 local-only switches are refused outside APP_ENV=local', () => {
    const env = baseEnvSchema.parse({ ...process.env, APP_ENV: 'uat' });
    expect(() => assertSafeProfile({ ...env, MFA_ENFORCED: false })).toThrow(/S-CFG-2/);
    expect(() => assertSafeProfile({ ...env, CORS_ORIGIN: '*' })).toThrow(/S-CFG-1/);
    expect(() => assertSafeProfile({ ...env, SMS_PROVIDER: 'log' })).toThrow(/S-CFG-4/);
    expect(() => assertSafeProfile({ ...env, APP_ENV: 'local', MFA_ENFORCED: false })).not.toThrow();
    expect(() => assertSafeProfile({ ...env, APP_ENV: 'local', NODE_ENV: 'production' })).toThrow(/S-CFG-5/);
  });
});
