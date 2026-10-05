import "server-only";

import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { NO_STORE } from "@/lib/security-headers";

import { SERVICES, serverConfig, type ServiceName } from "./config";
import type { TokenSet } from "./session";

/**
 * Server-to-service calls. The ONLY place the BFF builds a backend URL.
 *
 * Every call carries, and only carries:
 *   Authorization: Bearer <access token>   when a token is given
 *   x-request-id                           the incoming id when it looks sane, else a new uuid
 *   X-Forwarded-For: <client ip>           the real browser IP, so the services rate-limit per
 *                                          user and per IP instead of putting every user in the
 *                                          one bucket of the BFF's own address (a sister project
 *                                          had a production outage from exactly that)
 * The browser's Cookie header is never forwarded.
 */

export interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: { page: number; limit: number; total: number };
  code?: string;
  message?: string;
  details?: unknown;
  request_id?: string;
}

const REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * The browser's IP: the first hop of the incoming X-Forwarded-For (written by the ingress in UAT and
 * production; by Next's own server locally), else X-Real-IP. The ingress must overwrite, not append
 * to, a client-sent X-Forwarded-For (README "Decisions").
 */
export const clientIpOf = (h: Headers): string | null => {
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = first || h.get("x-real-ip")?.trim() || "";
  // An IP is digits, hex, dots and colons (IPv6, IPv4-mapped); anything else is not forwarded.
  return /^[0-9A-Fa-f:.]{2,45}$/.test(ip) ? ip : null;
};

export const requestIdOf = (h: Headers): string => {
  const incoming = h.get("x-request-id");
  return incoming && REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
};

export interface UpstreamInit {
  method?: string;
  /** Path below the service base, without a leading slash (e.g. `auth/login`, `centers/123`). */
  path: string;
  /** Raw query string including the `?`, or "". */
  search?: string;
  token?: string | null;
  body?: BodyInit | null;
  contentType?: string | null;
  accept?: string | null;
  /** Incoming request headers; defaults to the current request's (next/headers). */
  incoming?: Headers;
}

export async function upstreamFetch(service: ServiceName, init: UpstreamInit): Promise<Response> {
  const incoming = init.incoming ?? new Headers(await headers());
  const h = new Headers();
  if (init.token) h.set("authorization", `Bearer ${init.token}`);
  if (init.contentType) h.set("content-type", init.contentType);
  h.set("accept", init.accept ?? "application/json");
  h.set("x-request-id", requestIdOf(incoming));
  const ip = clientIpOf(incoming);
  if (ip) h.set("x-forwarded-for", ip);
  const ua = incoming.get("user-agent");
  if (ua) h.set("user-agent", ua.slice(0, 256));
  const url = `${SERVICES[service]}/${init.path.replace(/^\/+/, "")}${init.search ?? ""}`;
  return fetch(url, {
    method: init.method ?? "GET",
    headers: h,
    body: init.body ?? undefined,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(serverConfig.upstreamTimeoutMs),
  });
}

export async function readEnvelope<T>(res: Response): Promise<Envelope<T> | null> {
  try {
    return (await res.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

/** JSON call to a service for Server Components and route handlers; 503 instead of throwing when it is down. */
export async function callService<T>(service: ServiceName, init: UpstreamInit): Promise<{ status: number; body: Envelope<T> | null }> {
  try {
    const res = await upstreamFetch(service, init);
    return { status: res.status, body: await readEnvelope<T>(res) };
  } catch {
    return { status: 503, body: null };
  }
}

export const jsonError = (status: number, code: string, message: string, details?: unknown): NextResponse =>
  NextResponse.json({ success: false, code, message, ...(details === undefined ? {} : { details }) }, { status, headers: { "cache-control": NO_STORE } });

export const jsonOk = <T>(data: T, status = 200): NextResponse => NextResponse.json({ success: true, data }, { status, headers: { "cache-control": NO_STORE } });

/** Pass a service's error envelope through unchanged (or a generic one when it sent none). */
export const relayError = (status: number, body: Envelope<unknown> | null): NextResponse =>
  body && body.success === false
    ? NextResponse.json(body, { status, headers: { "cache-control": NO_STORE } })
    : jsonError(status >= 400 ? status : 502, "E_UPSTREAM", "The service returned an unexpected response");

export const upstreamDown = (): NextResponse => jsonError(503, "E_UPSTREAM", "The service is not reachable, please try again shortly");

/**
 * Refresh-token rotation, single flight per refresh token.
 *
 * A refresh token is single use, and presenting it twice revokes the whole session
 * (E_REFRESH_REPLAY). A page that fires several requests at once after the access token expired
 * would otherwise rotate the same token several times. Concurrent callers holding the same token
 * share one rotation, and its result is remembered for a few seconds for late arrivals.
 * Per server process; a multi-replica deployment should keep the browser on one replica
 * (session affinity) or accept the rare replay logout.
 */
interface Rotation {
  at: number;
  result: Promise<TokenSet | null>;
}
const rotations = new Map<string, Rotation>();
const ROTATION_REUSE_MS = 10_000;

export async function rotateTokens(refreshToken: string, incoming?: Headers): Promise<TokenSet | null> {
  const now = Date.now();
  for (const [k, v] of rotations) if (now - v.at > ROTATION_REUSE_MS) rotations.delete(k);
  const hit = rotations.get(refreshToken);
  if (hit) return hit.result;
  const result = (async () => {
    const { status, body } = await callService<TokenSet>("auth", {
      method: "POST",
      path: "auth/refresh",
      body: JSON.stringify({ refresh_token: refreshToken }),
      contentType: "application/json",
      incoming,
    });
    return status === 200 && body?.success && body.data?.access_token ? body.data : null;
  })();
  rotations.set(refreshToken, { at: now, result });
  return result;
}
