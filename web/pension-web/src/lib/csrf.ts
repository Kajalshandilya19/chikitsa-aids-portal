/**
 * CSRF protection: the double-submit cookie pattern (OWASP CSRF Prevention Cheat Sheet).
 *
 * src/proxy.ts gives every browser a random token in the `<prefix>_csrf` cookie. Page JS reads it
 * (that cookie is deliberately NOT httpOnly; it grants nothing on its own) and echoes it in the
 * `X-CSRF-Token` header of every state-changing `/api` request (src/lib/client/api.ts). The proxy
 * refuses the request unless header and cookie match AND the Origin is WEB_ORIGIN.
 *
 * Why this stops CSRF: another site can make the browser SEND our cookies, but it cannot READ
 * them, so it can never produce the matching header. The services are reached server-to-server
 * with a bearer token, never with browser cookies, so this boundary is the only one CSRF can reach.
 *
 * Shared by the proxy and the browser: no server-only or browser-only imports here.
 */

/** Methods that change state and therefore need the token. GET/HEAD/OPTIONS never do. */
export const isMutating = (method: string | undefined): boolean => ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());

/** 32 random bytes as hex. Web Crypto, so it works in both the proxy runtime and the browser. */
export const newCsrfToken = (): string => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Length-constant comparison, so a mismatch does not leak how many leading characters matched. */
export const tokensMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Mutating BFF routes that run BEFORE a session exists, so the browser may not hold the CSRF cookie
 * yet. They still need the Origin check, and none of them acts on an existing session.
 */
export const CSRF_EXEMPT: ReadonlySet<string> = new Set([
  "/api/auth/login",
  "/api/auth/login/mfa",
  "/api/auth/password/forgot",
  "/api/auth/password/reset",
  "/api/auth/captcha",
]);
