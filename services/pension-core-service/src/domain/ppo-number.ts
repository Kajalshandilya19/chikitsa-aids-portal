/**
 * PPO number pattern (docs/BUSINESS_RULES.md BR-P1..P3, docs/OPEN_QUESTIONS.md Q-05).
 *
 * The department has not given a format yet, so the pattern is a SETTING (`ppo.number_pattern`).
 * Tokens:
 *   {DIST}      district LGD code, 3 digits zero-padded      e.g. 086
 *   {CENTER}    Center code                                  e.g. RJ001
 *   {YYYY}      year of approval (IST)                        e.g. 2026
 *   {YY}        two-digit year                                e.g. 26
 *   {SEQ:n}     the sequence number, zero-padded to n digits (n = 4..8). Exactly once, required.
 * Everything else must be uppercase letters, digits, "/" or "-". The finished number must satisfy
 * V-037 (6-40 chars). Placeholder default: RJ/HIVP/{DIST}/{YYYY}/{SEQ:6}  ->  RJ/HIVP/086/2026/000001
 */
export const PPO_TOKENS = ['{DIST}', '{CENTER}', '{YYYY}', '{YY}'] as const;
const SEQ_TOKEN = /\{SEQ:([4-8])\}/g;

export interface PpoParts {
  districtLgdCode: number;
  centerCode: string;
  year: number;
  seq: number;
}

/** Problems with a pattern, or [] when it is usable. */
export const ppoPatternProblems = (pattern: string): string[] => {
  const problems: string[] = [];
  const seqs = [...pattern.matchAll(SEQ_TOKEN)];
  if (seqs.length !== 1) problems.push('The pattern must contain {SEQ:n} exactly once (n from 4 to 8).');
  let rest = pattern.replace(SEQ_TOKEN, '');
  for (const t of PPO_TOKENS) rest = rest.split(t).join('');
  if (/[{}]/.test(rest)) problems.push('Unknown token: only {DIST}, {CENTER}, {YYYY}, {YY} and {SEQ:n} are allowed.');
  else if (!/^[A-Z0-9/-]*$/.test(rest)) problems.push('Outside the tokens, only uppercase letters, digits, / and - are allowed.');
  if (!problems.length) {
    const sample = formatPpoNumber(pattern, { districtLgdCode: 999, centerCode: 'RJ0001', year: 2026, seq: 1 });
    if (sample.length < 6 || sample.length > 40) problems.push('A number made from this pattern must be 6 to 40 characters (V-037).');
  }
  return problems;
};

export const formatPpoNumber = (pattern: string, p: PpoParts): string =>
  pattern
    .replace('{DIST}', String(p.districtLgdCode).padStart(3, '0'))
    .replace('{CENTER}', p.centerCode)
    .replace('{YYYY}', String(p.year))
    .replace('{YY}', String(p.year).slice(-2))
    .replace(SEQ_TOKEN, (_m, n: string) => String(p.seq).padStart(Number(n), '0'));
