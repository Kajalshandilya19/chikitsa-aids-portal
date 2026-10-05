/**
 * Security response headers (OWASP Secure Headers / CSP cheat sheets), applied by src/proxy.ts to
 * every page and BFF response at request time. Ported from the Chikitsa-Raj frontend
 * (src/lib/security-headers.ts, VAPT 389/26-27/2798) and narrowed to what this portal needs.
 *
 * Content-Security-Policy allowlist: every origin the BROWSER itself talks to, and nothing else.
 * The browser only ever talks to this app (pages, /api BFF); the services are reached
 * server-to-server and need no entry.
 *   img-src data:      the captcha (an SVG data URL) and the TOTP enrolment QR (rendered locally)
 *   img-src blob:      previews of locally built files
 *   font-src data:     next/font self-hosts the fonts, some as data URLs
 *
 * Deliberate allowances:
 *   'unsafe-inline' scripts  the pre-paint theme script and Next's own inline bootstrap scripts;
 *                            nonces would be the next hardening step.
 *   'unsafe-eval'            `next dev` only (React Refresh). Never in a production build.
 *   'unsafe-inline' styles   the UI emits inline styles (radix positioning, widths).
 */

export interface SecurityHeaderOptions {
  /** Served over https (drives HSTS and upgrade-insecure-requests). */
  https: boolean;
  /** `next dev`: needs eval + the HMR websocket. */
  dev: boolean;
}

export function contentSecurityPolicy(o: SecurityHeaderOptions): string {
  const connect = ["'self'"];
  if (o.dev) connect.push("ws:", "wss:");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(o.dev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "font-src": ["'self'", "data:"],
    "img-src": ["'self'", "data:", "blob:"],
    "connect-src": connect,
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "frame-src": ["'none'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const csp = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (o.https) csp.push("upgrade-insecure-requests");
  return csp.join("; ");
}

/** Authenticated data must never be stored by the browser or an intermediary (CWE-525). */
export const NO_STORE = "no-cache, no-store, must-revalidate";

export function securityHeaders(o: SecurityHeaderOptions, { noStore }: { noStore: boolean }): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Security-Policy": contentSecurityPolicy(o),
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    // The portal needs none of these; third-party frames get none either.
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
    // A government back office: never indexed, whatever the page.
    "X-Robots-Tag": "noindex, nofollow",
  };
  // HSTS only where the site is actually https; on plain http it would be ignored at best.
  if (o.https) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  if (noStore) {
    h["Cache-Control"] = NO_STORE;
    h["Pragma"] = "no-cache";
    h["Expires"] = "0";
  }
  return h;
}
