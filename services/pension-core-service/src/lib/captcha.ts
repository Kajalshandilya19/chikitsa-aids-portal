import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { baseConfig } from './base-config';
import { AppError } from './errors';
import { kv } from './kv';

/**
 * Self-hosted arithmetic captcha (docs/SECURITY.md S-AUTH-3). Required on login and forgot password.
 * Ported from Chikitsa-Raj patient-service lookup-captcha.ts (VAPT retest, 28 Sep 2026).
 *
 *   newCaptcha()     { image, token, expires_in }. The image is an SVG of "a+b=?" whose glyphs are drawn
 *                    as STROKES, never <text>, so the question cannot be read out of the markup.
 *   verifyCaptcha()  the token is an HMAC over (nonce, expiry, answer), so any replica can check it
 *                    without state. The nonce is claimed in the shared kv store BEFORE the answer is
 *                    compared: one guess per challenge, right or wrong, and a solved token cannot be
 *                    replayed. Answers are 2 to 18, so a blind guess wins at most 1 time in 9; the login
 *                    rate limit and account lockout are what make guessing pointless.
 *
 * Local automation: when APP_ENV=local (and NODE_ENV is not production) the challenge also carries
 * `dev_answer`, so scripts/smoke-auth.mjs and integration tests can log in. base-config refuses
 * APP_ENV=local together with NODE_ENV=production, and every image runs NODE_ENV=production.
 */
const TTL_S = 300;
const key = (): Buffer => Buffer.from(baseConfig().PII_HMAC_KEY, 'base64');
const mac = (s: string): string => createHmac('sha256', key()).update(`captcha\n${s}`).digest('base64url');

export interface CaptchaChallenge {
  /** `data:image/svg+xml;base64,...` */
  image: string;
  token: string;
  expires_in: number;
  /** APP_ENV=local only. */
  dev_answer?: string;
}

export const newCaptcha = (): CaptchaChallenge => {
  const a = randomInt(1, 10);
  const b = randomInt(1, 10);
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  const nonce = randomBytes(12).toString('base64url');
  const token = `${exp}.${nonce}.${mac(`${exp}.${nonce}.${a + b}`)}`;
  const image = `data:image/svg+xml;base64,${Buffer.from(renderCaptchaSvg(`${a}+${b}=?`)).toString('base64')}`;
  const cfg = baseConfig();
  const local = cfg.APP_ENV === 'local' && cfg.NODE_ENV !== 'production';
  return { image, token, expires_in: TTL_S, ...(local ? { dev_answer: String(a + b) } : {}) };
};

const fail = () => new AppError(400, 'Incorrect captcha answer, please try again.', { code: 'E_CAPTCHA', expose: true });

/** Throws E_CAPTCHA / E_CAPTCHA_EXPIRED / E_CAPTCHA_USED. Every token is good for ONE attempt. */
export const verifyCaptcha = async (token: string | undefined, answer: string | number | undefined): Promise<void> => {
  if (!token || answer === undefined || answer === '' || token.length > 200) throw fail();
  const [exp, nonce, sig] = String(token).split('.');
  if (!exp || !nonce || !sig || !/^\d{10}$/.test(exp) || !/^[A-Za-z0-9_-]{16}$/.test(nonce)) throw fail();
  if (Number(exp) < Math.floor(Date.now() / 1000)) {
    throw new AppError(400, 'Captcha expired, please refresh it.', { code: 'E_CAPTCHA_EXPIRED', expose: true });
  }
  // Burn the nonce BEFORE comparing: a wrong guess spends the challenge too.
  if (!(await kv().setOnce(`captcha:${nonce}`, TTL_S + 60))) {
    throw new AppError(400, 'This captcha was already used, please refresh it.', { code: 'E_CAPTCHA_USED', expose: true });
  }
  const raw = String(answer).trim();
  if (!/^\d{1,2}$/.test(raw)) throw fail();
  const expected = Buffer.from(mac(`${exp}.${nonce}.${Number(raw)}`));
  const presented = Buffer.from(sig);
  if (expected.length !== presented.length || !timingSafeEqual(expected, presented)) throw fail();
};

// ---------------------------------------------------------------- drawing

type Pt = [number, number];

const ellipse = (cx: number, cy: number, rx: number, ry: number, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt;
  });

// Stroke skeletons on a 10 x 16 grid, y pointing down.
const GLYPHS: Readonly<Record<string, Pt[][]>> = {
  '0': [ellipse(5, 8, 4.5, 7.5, 14)],
  '1': [
    [
      [2, 4],
      [6, 0],
      [6, 16],
    ],
    [
      [2.5, 16],
      [9.5, 16],
    ],
  ],
  '2': [
    [
      [1, 4],
      [2.5, 1],
      [5, 0],
      [8, 1],
      [9, 3.5],
      [8, 6.5],
      [1, 16],
      [10, 16],
    ],
  ],
  '3': [
    [
      [1, 1.5],
      [4, 0],
      [7.5, 0.5],
      [9, 3],
      [8, 6],
      [4.5, 7.5],
    ],
    [
      [4.5, 7.5],
      [8.5, 9],
      [9.5, 12],
      [8, 15],
      [5, 16],
      [1.5, 15],
    ],
  ],
  '4': [
    [
      [7.5, 16],
      [7.5, 0],
      [0.5, 11],
      [10, 11],
    ],
  ],
  '5': [
    [
      [9, 0.5],
      [2, 0.5],
      [1.5, 7],
      [5, 6],
      [8, 7],
      [9.5, 10.5],
      [8.5, 14],
      [5, 16],
      [1, 15],
    ],
  ],
  '6': [
    [
      [8.5, 1],
      [5.5, 0],
      [2.5, 2],
      [1, 7],
      [1, 12],
      [3, 15.5],
      [6, 16],
      [8.5, 14],
      [9.5, 11],
      [8, 8.5],
      [5, 8],
      [2, 9.5],
      [1, 12],
    ],
  ],
  '7': [
    [
      [0.5, 0.5],
      [10, 0.5],
      [4, 16],
    ],
  ],
  '8': [ellipse(5, 4, 3.8, 3.8, 10), ellipse(5, 11.8, 4.5, 4.2, 12)],
  '9': [
    [
      [9, 7],
      [6.5, 8.5],
      [3, 8],
      [1, 5],
      [1.5, 2],
      [4, 0],
      [7, 0.5],
      [9, 3],
      [9, 7],
      [8.5, 12],
      [6, 15.5],
      [3, 16],
      [1, 14.5],
    ],
  ],
  '+': [
    [
      [5, 4],
      [5, 13],
    ],
    [
      [0.5, 8.5],
      [9.5, 8.5],
    ],
  ],
  '=': [
    [
      [0.5, 6],
      [9.5, 6],
    ],
    [
      [0.5, 11],
      [9.5, 11],
    ],
  ],
  '?': [
    [
      [1.5, 3.5],
      [3, 1],
      [5.5, 0],
      [8, 1],
      [9, 3.5],
      [8, 6],
      [5, 8.5],
      [5, 11.5],
    ],
    [
      [5, 14.5],
      [5, 15.8],
    ],
  ],
};

// Ink and paper of the IHMS SETU captcha.
const INK = ['#7a2d07', '#1c1917', '#9a3412', '#3f3f46'] as const;
const PAPER = '#f5f0e8';

const rand = (min: number, max: number): number => min + (randomInt(1_000_000) / 1_000_000) * (max - min);
const f = (n: number): string => n.toFixed(1);
const ink = (): string => INK[randomInt(INK.length)] as string;
const polyline = (pts: Pt[]): string => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');

const shuffle = <T>(xs: T[]): T[] => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  return xs;
};

/** 150 x 52 SVG of `text` (digits and + = ?), every glyph jittered, rotated and inked on its own. */
const renderCaptchaSvg = (text: string): string => {
  const W = 150;
  const H = 52;
  const glyphs = [...text];
  const step = (W - 40) / Math.max(1, glyphs.length - 1);
  const elements: string[] = [];

  glyphs.forEach((g, i) => {
    const cx = 20 + i * step + rand(-2, 2);
    const cy = H / 2 + rand(-3, 3);
    const angle = rand(-0.28, 0.28);
    const sx = rand(1.3, 1.5);
    const sy = rand(1.6, 1.85);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const colour = ink();
    const width = f(rand(2.1, 2.7));
    for (const stroke of GLYPHS[g] ?? []) {
      const pts = stroke.map(([gx, gy]) => {
        const x = (gx - 5 + rand(-0.35, 0.35)) * sx;
        const y = (gy - 8 + rand(-0.35, 0.35)) * sy;
        return [cx + x * cos - y * sin, cy + x * sin + y * cos] as Pt;
      });
      elements.push(
        `<path d="${polyline(pts)}" fill="none" stroke="${colour}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  });

  // Noise as in SETU: four faint curves across the whole image, and a scatter of dots.
  for (let i = 0; i < 4; i++) {
    elements.push(
      `<path d="M${f(rand(0, 20))} ${f(rand(0, H))} Q${f(rand(40, 140))} ${f(rand(-10, H + 10))} ${f(rand(W - 20, W))} ${f(rand(0, H))}" ` +
        `fill="none" stroke="${ink()}" stroke-width="${f(rand(0.8, 1.6))}" opacity="0.55"/>`,
    );
  }
  for (let i = 0; i < 30; i++) {
    elements.push(
      `<circle cx="${f(rand(0, W))}" cy="${f(rand(0, H))}" r="${f(rand(0.6, 1.4))}" fill="${ink()}" opacity="0.5"/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${PAPER}"/>${shuffle(elements).join('')}</svg>`
  );
};
