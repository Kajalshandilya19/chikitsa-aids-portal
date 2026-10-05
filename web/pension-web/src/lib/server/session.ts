import "server-only";

import { cookies } from "next/headers";

import { cookieNames, serverConfig } from "./config";

/**
 * Service tokens live only in httpOnly cookies; no token ever reaches browser JS or a response
 * body. The refresh and MFA cookies are scoped to /api/auth so they never ride along on page or
 * gateway requests. Every cookie is SameSite=Strict.
 */

/** The `DONE` login shape (auth-service API_AUTH.md §2), minus the user. */
export interface TokenSet {
  access_token: string;
  expires_at?: string | null;
  refresh_token?: string | null;
  refresh_expires_at?: string | null;
}

const MFA_MAX_AGE_S = 5 * 60;
const base = () => ({ httpOnly: true, secure: serverConfig.cookieSecure, sameSite: "strict" as const });

/** Seconds from now until an ISO instant, at least `min`. */
const secondsUntil = (iso: string | null | undefined, fallback: number, min = 30): number => {
  const at = iso ? new Date(iso).getTime() : NaN;
  if (Number.isNaN(at)) return fallback;
  return Math.max(min, Math.floor((at - Date.now()) / 1000));
};

export const getAccessToken = async (): Promise<string | null> => (await cookies()).get(cookieNames.access)?.value ?? null;
/** Visible only to route handlers under /api/auth (cookie path). */
export const getRefreshToken = async (): Promise<string | null> => (await cookies()).get(cookieNames.refresh)?.value ?? null;
/** Visible only to route handlers under /api/auth (cookie path). */
export const getMfaToken = async (): Promise<string | null> => (await cookies()).get(cookieNames.mfa)?.value ?? null;

/** Route Handlers only (a Server Component cannot write cookies). */
export const setSession = async (t: TokenSet): Promise<void> => {
  const store = await cookies();
  // The access cookie lives as long as the token: once it is gone the proxy sends page loads
  // through /api/auth/refresh/redirect and the client helper calls /api/auth/refresh.
  store.set(cookieNames.access, t.access_token, { ...base(), path: "/", maxAge: secondsUntil(t.expires_at, 15 * 60) });
  if (t.refresh_token) {
    store.set(cookieNames.refresh, t.refresh_token, { ...base(), path: "/api/auth", maxAge: secondsUntil(t.refresh_expires_at, 8 * 3600, 60) });
  }
};

export const clearSession = async (): Promise<void> => {
  const store = await cookies();
  store.set(cookieNames.access, "", { ...base(), path: "/", maxAge: 0 });
  store.set(cookieNames.refresh, "", { ...base(), path: "/api/auth", maxAge: 0 });
  store.set(cookieNames.mfa, "", { ...base(), path: "/api/auth", maxAge: 0 });
};

export const setMfaToken = async (token: string, expiresIn?: number): Promise<void> => {
  const maxAge = Math.min(MFA_MAX_AGE_S, Math.max(30, Math.floor(expiresIn ?? MFA_MAX_AGE_S)));
  (await cookies()).set(cookieNames.mfa, token, { ...base(), path: "/api/auth", maxAge });
};

export const clearMfaToken = async (): Promise<void> => {
  (await cookies()).set(cookieNames.mfa, "", { ...base(), path: "/api/auth", maxAge: 0 });
};
