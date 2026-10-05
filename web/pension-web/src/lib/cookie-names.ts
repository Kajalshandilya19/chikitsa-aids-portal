/**
 * Cookie names and the Secure flag, shared by the proxy, the route handlers and the browser.
 * No server-only or browser-only imports here.
 *
 *   <prefix>_access   httpOnly, Path=/          the access token (JWT), SameSite=Strict
 *   <prefix>_refresh  httpOnly, Path=/api/auth  the refresh token, never sent to pages or the gateway
 *   <prefix>_mfa      httpOnly, Path=/api/auth  the mfa_token between the password and TOTP steps (5 min)
 *   <prefix>_csrf     JS-readable, Path=/       the double-submit CSRF token (grants nothing on its own)
 *
 * The prefix comes from SESSION_COOKIE_PREFIX (default `hp`), inlined at build time by next.config.ts.
 */
export interface CookieNames {
  access: string;
  refresh: string;
  mfa: string;
  csrf: string;
}

export const cookieNamesFor = (prefix: string | undefined): CookieNames => {
  const p = prefix && prefix.trim() ? prefix.trim() : "hp";
  return { access: `${p}_access`, refresh: `${p}_refresh`, mfa: `${p}_mfa`, csrf: `${p}_csrf` };
};

export const COOKIE_NAMES: CookieNames = cookieNamesFor(process.env.SESSION_COOKIE_PREFIX);

/** Secure unless COOKIE_SECURE is explicitly "false" (allowed only when APP_ENV=local, see lib/server/config.ts). */
export const cookieSecureFromEnv = (v: string | undefined): boolean => !(v === "false" || v === "0");

/** The header the browser echoes the CSRF cookie in. */
export const CSRF_HEADER = "x-csrf-token";
