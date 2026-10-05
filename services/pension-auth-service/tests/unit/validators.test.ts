import * as v from '../../src/lib/validators';

/** UT-VAL-*: one block per rule in docs/VALIDATION_RULES.md. Each case names what it proves. */
const ok = (schema: { safeParse: (x: unknown) => { success: boolean } }, value: unknown) => expect(schema.safeParse(value).success).toBe(true);
const bad = (schema: { safeParse: (x: unknown) => { success: boolean } }, value: unknown) => expect(schema.safeParse(value).success).toBe(false);
const out = <T>(schema: { parse: (x: unknown) => T }, value: unknown): T => schema.parse(value);

describe('validators', () => {
  test('UT-VAL-001 personName: letters of any script, collapses spaces, refuses digits and markup', () => {
    ok(v.personName, 'Asha Devi');
    ok(v.personName, "D'Souza Ram-Kumar");
    ok(v.personName, 'आशा देवी');
    expect(out(v.personName, '  Asha    Devi ')).toBe('Asha Devi');
    bad(v.personName, 'A');
    bad(v.personName, 'Asha2');
    bad(v.personName, '<b>Asha</b>');
    bad(v.personName, 'x'.repeat(101));
  });

  test('UT-VAL-002 userCode: lowercased, 4-32, starts with a letter', () => {
    expect(out(v.userCode, 'Worker.RJ001')).toBe('worker.rj001');
    bad(v.userCode, 'abc');
    bad(v.userCode, '1worker');
    bad(v.userCode, 'worker rj001');
  });

  test('UT-VAL-003 centerCode: uppercased, 3-16, letter first', () => {
    expect(out(v.centerCode, 'rj001')).toBe('RJ001');
    bad(v.centerCode, '001');
    bad(v.centerCode, 'R');
    bad(v.centerCode, 'RJ 001');
  });

  test('UT-VAL-004 mobile: normalises +91, 91, leading 0, spaces; requires 6-9 start', () => {
    expect(out(v.mobile, '+91 98765 43210')).toBe('9876543210');
    expect(out(v.mobile, '09876543210')).toBe('9876543210');
    expect(out(v.mobile, '919876543210')).toBe('9876543210');
    bad(v.mobile, '5876543210');
    bad(v.mobile, '98765');
  });

  test('UT-VAL-005 email: lowercased and checked', () => {
    expect(out(v.email, 'A.B@Example.ORG')).toBe('a.b@example.org');
    bad(v.email, 'not-an-email');
  });

  test('UT-VAL-006 password policy: length and all four character classes', () => {
    ok(v.password, 'Strong@Pass1');
    bad(v.password, 'Short@1a');
    bad(v.password, 'nouppercase@1');
    bad(v.password, 'NOLOWERCASE@1');
    bad(v.password, 'NoDigits@Here');
    bad(v.password, 'NoSymbol1Here');
    bad(v.password, ' Strong@Pass1');
  });

  test('UT-VAL-007 aadhaar: 12 digits, 2-9 first, Verhoeff check digit', () => {
    // 234123412346 is a commonly used Verhoeff-valid test number (not a real person).
    ok(v.aadhaar, '2341 2341 2346');
    expect(out(v.aadhaar, '2341-2341-2346')).toBe('234123412346');
    bad(v.aadhaar, '234123412345');
    bad(v.aadhaar, '123412341234');
    bad(v.aadhaar, '22222222222');
    expect(v.verhoeffValid('2363')).toBe(true);
    expect(v.verhoeffValid('2364')).toBe(false);
  });

  test('UT-VAL-008/009 Jan Aadhaar family 10 digits, member 11 digits', () => {
    ok(v.janAadhaarFamilyId, '1234567890');
    bad(v.janAadhaarFamilyId, '123456789');
    ok(v.janAadhaarMemberId, '12345678901');
    bad(v.janAadhaarMemberId, '1234567890');
  });

  test('UT-VAL-010 ifsc: uppercased, 4 letters + 0 + 6 alphanumerics', () => {
    expect(out(v.ifsc, 'sbin0001234')).toBe('SBIN0001234');
    bad(v.ifsc, 'SBIN1001234');
    bad(v.ifsc, 'SBI00012345');
  });

  test('UT-VAL-011 bankAccountNumber: 9-18 digits, not all zeros', () => {
    ok(v.bankAccountNumber, '123456789012');
    bad(v.bankAccountNumber, '12345678');
    bad(v.bankAccountNumber, '000000000');
    bad(v.bankAccountNumber, '12345678A');
  });

  test('UT-VAL-012 bankName', () => {
    ok(v.bankName, 'State Bank of India');
    ok(v.bankName, 'Bank of Baroda (Rajasthan)');
    bad(v.bankName, 'X');
    bad(v.bankName, 'Bank<script>');
  });

  test('UT-VAL-013 address: refuses markup and unusual symbols', () => {
    ok(v.address, 'House 12, Ward 4\nNear Bus Stand, Ajmer');
    bad(v.address, 'abc');
    bad(v.address, 'House <12>');
    bad(v.address, 'House 12; DROP');
  });

  test('UT-VAL-014 remarks: optional, empty becomes null, no markup', () => {
    expect(out(v.remarks, '   ')).toBeNull();
    expect(out(v.remarks, 'Documents verified')).toBe('Documents verified');
    bad(v.remarks, 'a < b');
  });

  test('UT-VAL-015 reason: 10-500 chars', () => {
    ok(v.reason, 'Bank passbook copy is not readable');
    bad(v.reason, 'too short');
  });

  test('UT-VAL-016 pastDate: real date, not before 1990, not in the future', () => {
    ok(v.pastDate, '2015-06-30');
    bad(v.pastDate, '2015-02-30');
    bad(v.pastDate, '1989-12-31');
    bad(v.pastDate, '2999-01-01');
    bad(v.pastDate, '30/06/2015');
  });

  test('UT-VAL-017 age: whole number 0-120', () => {
    expect(out(v.age, '45')).toBe(45);
    bad(v.age, 121);
    bad(v.age, 4.5);
    bad(v.age, -1);
  });

  test('UT-VAL-018..020 enums: sex, category, consent', () => {
    ok(v.sex, 'TRANSGENDER');
    bad(v.sex, 'M');
    ok(v.category, 'MBC');
    bad(v.category, 'OTHER');
    ok(v.consent, 'YES');
    bad(v.consent, 'Y');
  });

  test('UT-VAL-021..025 SOCH identifiers: uppercased, bounded, letters digits / -', () => {
    expect(out(v.sochUid, 'ab-12/3')).toBe('AB-12/3');
    bad(v.sochUid, 'AB');
    bad(v.artNumber, 'ART 12');
    ok(v.pidNumber, 'PID12345');
    ok(v.sochBeneficiaryId, '7');
  });

  test('UT-VAL-026 abhaNumber: 14 digits, hyphens removed', () => {
    expect(out(v.abhaNumber, '12-3456-7890-1234')).toBe('12345678901234');
    bad(v.abhaNumber, '1234');
  });

  test('UT-VAL-027..032 codes, OTPs, search, paging, uuid', () => {
    expect(out(v.lgdCode, '86')).toBe(86);
    bad(v.lgdCode, 0);
    ok(v.totpCode, '123456');
    bad(v.totpCode, '12345');
    ok(v.otpCode, '000001');
    bad(v.searchText, '');
    bad(v.searchText, '<img>');
    ok(v.uuid, '2f1b7f0e-6a9e-4f5c-9c55-5d7c6f7f2a10');
    bad(v.uuid, 'not-a-uuid');
  });

  test('UT-VAL-033 amountRupees: positive, at most 1,00,000, 2 decimals', () => {
    expect(out(v.amountRupees, '1500.50')).toBe(1500.5);
    bad(v.amountRupees, 0);
    bad(v.amountRupees, 100001);
    bad(v.amountRupees, 10.123);
  });

  test('UT-VAL-034..040 period, hindi, pincode, PPO, label, ART status, center type', () => {
    ok(v.paymentPeriod, '2026-09');
    bad(v.paymentPeriod, '2026-13');
    ok(v.hindiText, 'अजमेर');
    bad(v.hindiText, 'Ajmer');
    ok(v.pincode, '305001');
    bad(v.pincode, '012345');
    expect(out(v.ppoNumber, 'rj/hivp/086/2026/000001')).toBe('RJ/HIVP/086/2026/000001');
    ok(v.englishLabel, 'ART Centre, JLN Hospital (Ajmer)');
    bad(v.englishLabel, 'केंद्र');
    ok(v.artStatus, 'ON_ART_LFU');
    bad(v.artStatus, 'LOST');
    ok(v.centerType, 'LAC');
    bad(v.centerType, 'PHC');
  });

  test('UT-VAL-041 captchaAnswer: 1 or 2 digits', () => {
    ok(v.captchaAnswer, ' 12 ');
    bad(v.captchaAnswer, '123');
    bad(v.captchaAnswer, 'ab');
  });
});
