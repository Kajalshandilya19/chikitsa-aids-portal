import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import type { LoginResult, Me } from "@/lib/api-types";
import { NO_STORE } from "@/lib/security-headers";

import { clearMfaToken, clearSession, getAccessToken, getRefreshToken, setMfaToken, setSession, type TokenSet } from "./session";
import { callService, jsonError, jsonOk, relayError, rotateTokens, upstreamDown, type Envelope, type UpstreamInit } from "./upstream";

/**
 * Shared steps of the /api/auth/* route handlers. These routes are the only ones that can see the
 * refresh cookie (Path=/api/auth), so they refresh server-side when the access token has expired.
 */

const MAX_JSON_BYTES = 16 * 1024;

/** The request body as a plain object, or null when it is not one (or is too large). */
export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) return null;
  const text = await request.text().catch(() => "");
  if (text.length > MAX_JSON_BYTES) return null;
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Only the listed keys are forwarded; the services' DTOs are `.strict()` and refuse anything else. */
export const pick = (obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") out[k] = obj[k];
  return out;
};

export const badRequest = () => jsonError(400, "E_BAD_REQUEST", "The request could not be read");

/** The `DONE` / `MFA_*` shapes of /auth/login, /auth/login/mfa and /auth/switch. */
export interface LoginData extends TokenSet {
  step: LoginResult["step"];
  must_change_password?: boolean;
  needs_selection?: boolean;
  user?: Me;
  mfa_token?: string;
  expires_in?: number;
  otpauth_url?: string;
  secret?: string;
}

/** Turn a login-step response into cookies plus a token-free body for the browser. */
export async function respondToLoginStep(data: LoginData): Promise<NextResponse> {
  if (data.step === "DONE" && data.access_token) {
    await setSession(data);
    await clearMfaToken();
    const out: LoginResult = { step: "DONE", must_change_password: !!data.must_change_password, needs_selection: !!data.needs_selection, user: data.user };
    return jsonOk(out);
  }
  if ((data.step === "MFA_REQUIRED" || data.step === "MFA_ENROLL") && data.mfa_token) {
    await setMfaToken(data.mfa_token, data.expires_in);
    const out: LoginResult = data.step === "MFA_ENROLL" ? { step: data.step, otpauth_url: data.otpauth_url, secret: data.secret } : { step: data.step };
    return jsonOk(out);
  }
  return jsonError(502, "E_UPSTREAM", "The sign-in service returned an unexpected response");
}

const isOk = (status: number) => status >= 200 && status < 300;

/**
 * A call to auth-service with the session's access token. When the token has expired (401) and a
 * refresh cookie exists, rotate once, save the new cookies, and retry once.
 */
export async function authedAuthCall<T>(init: Omit<UpstreamInit, "token">): Promise<{ status: number; body: Envelope<T> | null }> {
  const access = await getAccessToken();
  let r = access ? await callService<T>("auth", { ...init, token: access }) : { status: 401, body: null };
  if (r.status === 401) {
    const refresh = await getRefreshToken();
    const rotated = refresh ? await rotateTokens(refresh) : null;
    if (rotated) {
      await setSession(rotated);
      r = await callService<T>("auth", { ...init, token: rotated.access_token });
    }
  }
  return r;
}

/** Relay a service envelope to the browser: the success body as-is, or the error envelope. */
export function relay<T>(r: { status: number; body: Envelope<T> | null }): NextResponse {
  if (r.status === 503 && !r.body) return upstreamDown();
  if (!isOk(r.status) || !r.body?.success) {
    if (r.status === 401 && !r.body) return jsonError(401, "E_SESSION_EXPIRED", "Your session has ended, please log in again");
    return relayError(r.status, r.body);
  }
  return NextResponse.json(r.body, { status: r.status, headers: { "cache-control": NO_STORE } });
}

/** Ends the session of this browser at auth-service (best effort) and drops every session cookie. */
export async function endSession(): Promise<void> {
  const access = await getAccessToken();
  if (access) {
    await callService("auth", { method: "POST", path: "auth/logout", body: "{}", contentType: "application/json", token: access });
  }
  await clearSession();
}

export { isOk };
