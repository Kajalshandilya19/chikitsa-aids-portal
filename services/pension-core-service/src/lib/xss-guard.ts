import type { RequestHandler } from 'express';
import { BadRequestError } from './errors';

/*
 * Server-side refusal of script-injection input (VAPT 389/26-27/2798 #4 and #5, CWE-602/CWE-1287).
 *
 * The browser already refuses these patterns, but a request edited in a proxy never passes through
 * the browser. Mounted once in app.ts after the body parsers, this walks every string in the JSON /
 * urlencoded body and the query string and answers 400 E_UNSAFE_INPUT on the first hit, naming the
 * field. Nothing is stripped: silently rewriting clinical text is worse than refusing it.
 *
 * The patterns are the high-confidence injection vectors only (script-capable tags, inline event
 * handlers, script URLs), so ordinary text such as "BP < 120", "O'Brien" or "a < b" and the
 * rich-text editor's own HTML (`<p>`, `<strong>`, `<img src="data:image/png…">`) pass. Fields that
 * must hold no markup at all (names, reasons, remarks) are tightened further in their zod DTOs.
 *
 * Encoded payloads are decoded before matching (retest, 28 Sep 2026): the auditor stored
 * `%3cscript%3e…` in a patient name, and `<script>` typed into the rich-text editor arrives as
 * `&lt;script&gt;`. Percent-encoding, HTML entities and `\u003c` / `\x3c` escapes are unwrapped
 * (up to three layers) and control characters dropped (`java\tscript:`) for the check only; the
 * stored value is never rewritten.
 *
 * Kept in sync with web/pension-web/src/lib/input-security.ts. Byte-identical in every
 * service.
 */

export const XSS_PATTERNS: readonly RegExp[] = [
  /<\s*script\b/i,
  /<\s*\/\s*script\s*>/i,
  /<\s*(iframe|object|embed|applet|base|svg|math|frame|frameset|meta|link|style)\b[^>]*>/i,
  /<[a-z!/?][^>]*[\s/"'`]on[a-z]+\s*=/i,
  /(?:javascript|vbscript)\s*:/i,
  /\bsrcdoc\s*=/i,
  /<[^>]*\bdata\s*:\s*text\/html/i,
];

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  amp: '&',
  colon: ':',
  sol: '/',
  bsol: '\\',
  lpar: '(',
  rpar: ')',
  equals: '=',
  tab: '\t',
  newline: '\n',
  nbsp: ' ',
};

const decodeOnce = (s: string): string =>
  s
    .replace(/%([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u\{?([0-9a-f]{2,6})\}?|\\x([0-9a-f]{2})/gi, (m, u?: string, x?: string) => {
      const n = parseInt(u ?? x ?? '', 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});?/gi, (m, g: string) => {
      if (g[0] !== '#') return NAMED_ENTITIES[g.toLowerCase()] ?? m;
      const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    });

/** The value with every encoding layer unwrapped and control characters removed, for matching. */
export const unwrapForScan = (value: string): string => {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  return out.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, '').replace(/\t/g, '');
};

const MAY_BE_ENCODED = /[%&\\\u0000-\u001f\u007f]/;

export const containsXss = (value: string): boolean => {
  if (XSS_PATTERNS.some((re) => re.test(value))) return true;
  if (!MAY_BE_ENCODED.test(value)) return false;
  const unwrapped = unwrapForScan(value);
  return unwrapped !== value && XSS_PATTERNS.some((re) => re.test(unwrapped));
};

const MAX_DEPTH = 32;

/** Path of the first string (or object key) carrying a pattern, or null when clean. */
export const findXss = (value: unknown, path = '', depth = 0): string | null => {
  if (typeof value === 'string') return containsXss(value) ? path || '(value)' : null;
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findXss(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    const at = path ? `${path}.${k}` : k;
    if (containsXss(k)) return at;
    const hit = findXss(v, at, depth + 1);
    if (hit) return hit;
  }
  return null;
};

export const xssGuard = (): RequestHandler => (req, _res, next) => {
  const hit = findXss(req.body, 'body') ?? findXss(req.query, 'query');
  if (!hit) return next();
  return next(
    new BadRequestError('request refused: input contains script or markup that is not allowed', {
      code: 'E_UNSAFE_INPUT',
      details: { field: hit },
    }),
  );
};
