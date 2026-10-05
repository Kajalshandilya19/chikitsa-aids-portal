import { NextResponse, type NextRequest } from "next/server";

import { serverConfig } from "@/lib/server/config";
import { clearSession, getRefreshToken, setSession } from "@/lib/server/session";
import { rotateTokens } from "@/lib/server/upstream";

/**
 * Page-navigation refresh: the access cookie has expired but the refresh cookie (path /api/auth)
 * may still be valid. Rotate it and send the browser back to the page (with `_r=1`, so the proxy
 * cannot loop); otherwise to /login, with `expired=1` when there was a session that has now ended.
 * Redirects are built on WEB_ORIGIN, never on the request's Host header.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
  const safeNext = /^\/dashboard(\/[A-Za-z0-9/_-]*)?$/.test(next) ? next : "/dashboard";
  const to = (path: string, params: Record<string, string>) => {
    const url = new URL(path, serverConfig.webOrigin);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url);
  };
  const refresh = await getRefreshToken();
  if (!refresh) return to("/login", { next: safeNext });
  const rotated = await rotateTokens(refresh);
  if (!rotated) {
    await clearSession();
    return to("/login", { expired: "1", next: safeNext });
  }
  await setSession(rotated);
  return to(safeNext, { _r: "1" });
}
