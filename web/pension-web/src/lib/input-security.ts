/**
 * Browser-side mirror of the services' xss-guard (services/<svc>/src/lib/xss-guard.ts), ported from
 * the Chikitsa-Raj frontend. Shared client-side detection of dangerous / XSS input
 * (Improper Input Validation, CWE-1287). lib/client/api.ts refuses to send a body that matches.
 *
 * Policy (confirmed with the team): dangerous markup such as `<script>` must
 * NEVER be accepted or stored, even in a plain-text field. We therefore REJECT
 * input containing high-confidence injection patterns rather than silently
 * stripping it (stripping would mutate clinical data). The backend enforces the
 * same rule globally; this client layer gives immediate feedback and a clean UX.
 *
 * The pattern set is tuned to catch real injection vectors (script/embed tags,
 * inline event handlers, script protocols) while NOT flagging ordinary text such
 * as "BP < 120", "O'Brien", or a math expression like "a < b". Keep these
 * patterns in sync with the backend guard, src/lib/xss-guard.ts in every service.
 */

export const XSS_PATTERNS: readonly RegExp[] = [
  /<\s*script\b/i, // <script ...>
  /<\s*\/\s*script\s*>/i, // </script>
  /<\s*(iframe|object|embed|applet|base|svg|math|frame|frameset|meta|link|style)\b[^>]*>/i, // script-capable elements
  /<[a-z!/?][^>]*[\s/"'`]on[a-z]+\s*=/i, // inline event handler inside a tag: <img onerror=...>, <img/onerror=...>
  /(?:javascript|vbscript)\s*:/i, // script protocol (href/src=javascript:...)
  /\bsrcdoc\s*=/i, // <iframe srcdoc="...">
  /<[^>]*\bdata\s*:\s*text\/html/i, // data:text/html payload
];

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  amp: "&",
  colon: ":",
  sol: "/",
  bsol: "\\",
  lpar: "(",
  rpar: ")",
  equals: "=",
  tab: "\t",
  newline: "\n",
  nbsp: " ",
};

const decodeOnce = (s: string): string =>
  s
    .replace(/%([0-9a-f]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\u\{?([0-9a-f]{2,6})\}?|\\x([0-9a-f]{2})/gi, (m, u?: string, x?: string) => {
      const n = parseInt(u ?? x ?? "", 16);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});?/gi, (m, g: string) => {
      if (g[0] !== "#") return NAMED_ENTITIES[g.toLowerCase()] ?? m;
      const n = g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    });

/**
 * The value with percent-encoding, HTML entities and `\u003c` / `\x3c` escapes unwrapped (up to
 * three layers) and control characters dropped, for matching only. The retest (28 Sep 2026) stored
 * `%3cscript%3e` in a name, and `<script>` typed into the rich-text editor arrives as `&lt;script&gt;`.
 */
export function unwrapForScan(value: string): string {
  let out = value;
  for (let i = 0; i < 3; i++) {
    const next = decodeOnce(out);
    if (next === out) break;
    out = next;
  }
  // Control characters are exactly what this strips (`java\tscript:`), hence the rule exception.
  // eslint-disable-next-line no-control-regex
  return out.replace(/[\u0000-\u0008\u000a-\u001f\u007f]/g, "").replace(/\t/g, "");
}

// A control character may hide an encoded payload.
// eslint-disable-next-line no-control-regex
const MAY_BE_ENCODED = /[%&\\\u0000-\u001f\u007f]/;

/**
 * True if the value contains a high-confidence XSS / script-injection pattern, raw or encoded.
 * Non-strings (numbers, booleans, null) are always safe.
 */
export function containsXss(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (XSS_PATTERNS.some((re) => re.test(value))) return true;
  if (!MAY_BE_ENCODED.test(value)) return false;
  const unwrapped = unwrapForScan(value);
  return unwrapped !== value && XSS_PATTERNS.some((re) => re.test(unwrapped));
}

/** `<` or `>` in any encoding: for fields that must hold no markup at all (names, reasons). */
export const ENCODED_ANGLE = /%3[ce]|&(?:lt|gt|#0*6[02]|#x0*3[ce]);?|\\u0*3[ce]|\\x3[ce]/i;

export function hasAngleBrackets(value: string): boolean {
  return /[<>]/.test(value) || ENCODED_ANGLE.test(value);
}

/**
 * Deep scan an arbitrary value (object / array / primitive) for XSS, e.g. a
 * whole form payload. Returns the first offending field path, or null if clean.
 */
export function findXss(value: unknown, path = ""): string | null {
  if (typeof value === "string") {
    return containsXss(value) ? path || "(value)" : null;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findXss(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findXss(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Strip dangerous markup from a value so it can never enter form state. The
 * input components call this on every change, so script / markup is removed the
 * instant it is typed or pasted (the user can't submit it at all). A whole
 * `<script>...` run is removed even before its closing tag is typed, so completing
 * "<script" clears it immediately.
 */
export function sanitizeInput(value: string): string {
  if (!value) return value;
  let out = value;
  // Remove a whole script/style run first: to its closing tag, or to the end of the
  // string while it's still being typed.
  out = out.replace(/<\s*script\b[\s\S]*?(?:<\s*\/\s*script\s*>|$)/gi, "");
  out = out.replace(/<\s*style\b[\s\S]*?(?:<\s*\/\s*style\s*>|$)/gi, "");
  // Then strip any remaining high-confidence patterns.
  for (const re of XSS_PATTERNS) {
    const global = re.flags.includes("g")
      ? re
      : new RegExp(re.source, re.flags + "g");
    out = out.replace(global, "");
  }
  // A payload that only exists encoded (`%3cscript%3e`, `&lt;script&gt;`) loses its brackets.
  if (containsXss(out)) out = out.replace(new RegExp(ENCODED_ANGLE.source, "gi"), "");
  return out;
}

export const XSS_ERROR_MESSAGE =
  "This value contains characters that are not allowed (possible script or markup). Please remove them.";
