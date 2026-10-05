import { NextResponse, type NextRequest } from "next/server";

import { COOKIE_NAMES, CSRF_HEADER, cookieSecureFromEnv } from "@/lib/cookie-names";
import { CSRF_EXEMPT, isMutating, newCsrfToken, tokensMatch } from "@/lib/csrf";
import { securityHeaders } from "@/lib/security-headers";

/**
 * Proxy (formerly Middleware, renamed in Next.js 16). Three jobs:
 *
 * 1. Optimistic session gate for /dashboard/**: cookie PRESENCE only, a UX shortcut and NOT the
 *    security boundary (the dashboard layout verifies the token with auth-service /auth/me, and
 *    every service checks the bearer token and permissions itself). The refresh cookie is scoped
 *    to /api/auth and invisible here, so a page load without an access cookie goes once through
 *    /api/auth/refresh/redirect, which comes back with a fresh access cookie or lands on /login.
 *
 * 2. CSRF for the BFF (src/lib/csrf.ts): every mutating /api request must come from WEB_ORIGIN
 *    (Origin, else Referer) and, except the pre-session routes in CSRF_EXEMPT, echo the
 *    `<prefix>_csrf` cookie in `X-CSRF-Token`. Refused with 403 E_CSRF otherwise.
 *
 * 3. Security headers (src/lib/security-headers.ts) on every response, no-store on /dashboard,
 *    /api and the sign-in pages, and the CSRF cookie issued when the browser has none.
 */
const COOKIE_SECURE = cookieSecureFromEnv(process.env.COOKIE_SECURE);
const CSRF_MAX_AGE_S = 12 * 60 * 60;
const NO_STORE_PAGES = ["/dashboard", "/login", "/forgot-password", "/change-password"];

const webOrigin = (): string | null => {
  try {
    return new URL(process.env.WEB_ORIGIN ?? "http://localhost:3200").origin;
  } catch {
    return null;
  }
};

/** Origin (or, failing that, Referer) must be exactly WEB_ORIGIN. Neither header: refused. */
function originAllowed(request: NextRequest): boolean {
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  const expected = webOrigin();
  if (!source || source === "null" || !expected) return false;
  try {
    return new URL(source).origin === expected;
  } catch {
    return false;
  }
}

const refuse = (reason: string) => NextResponse.json({ success: false, code: "E_CSRF", message: `request refused: ${reason}` }, { status: 403 });

function finalize(request: NextRequest, response: NextResponse): NextResponse {
  const { pathname } = request.nextUrl;
  const https = COOKIE_SECURE || (request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol).startsWith("https");
  const noStore = pathname.startsWith("/api/") || NO_STORE_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  for (const [k, v] of Object.entries(securityHeaders({ https, dev: process.env.NODE_ENV === "development" }, { noStore }))) response.headers.set(k, v);
  if (!request.cookies.get(COOKIE_NAMES.csrf)?.value) {
    // JS-readable on purpose (double submit); Strict so it never travels on a cross-site request.
    response.cookies.set(COOKIE_NAMES.csrf, newCsrfToken(), { httpOnly: false, secure: COOKIE_SECURE, sameSite: "strict", path: "/", maxAge: CSRF_MAX_AGE_S });
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (pathname.startsWith("/api/")) {
    if (isMutating(method)) {
      if (!originAllowed(request)) return finalize(request, refuse("cross-origin request"));
      if (!CSRF_EXEMPT.has(pathname)) {
        const cookie = request.cookies.get(COOKIE_NAMES.csrf)?.value;
        if (!tokensMatch(cookie, request.headers.get(CSRF_HEADER))) return finalize(request, refuse("missing or invalid CSRF token"));
      }
    }
    return finalize(request, NextResponse.next());
  }

  // Pages answer GET and HEAD only; there are no Server Actions. A POST is a form submitted before
  // hydration (the secret-bearing forms carry method="post" so a password never lands in a query
  // string): send it back to the page as a GET, dropping the body. Anything else is 405.
  if (method === "POST") return finalize(request, NextResponse.redirect(new URL(`${pathname}${search}`, request.url), 303));
  if (method !== "GET" && method !== "HEAD") return finalize(request, new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } }));

  const isDashboard = pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  if (isDashboard && !request.cookies.has(COOKIE_NAMES.access)) {
    const url = request.nextUrl.clone();
    url.search = "";
    if (request.nextUrl.searchParams.get("_r") === "1") {
      // Already came back from the refresh route without a session: stop here.
      url.pathname = "/login";
    } else {
      url.pathname = "/api/auth/refresh/redirect";
    }
    url.searchParams.set("next", pathname);
    return finalize(request, NextResponse.redirect(url));
  }

  return finalize(request, NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
