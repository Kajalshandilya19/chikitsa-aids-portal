import { cookieNamesFor, cookieSecureFromEnv } from "@/lib/cookie-names";

/**
 * Server-side settings, read from the active profile (env/local.env locally, the pod's env in
 * UAT and production). Evaluated once per server process; src/instrumentation.ts imports this
 * module at boot so a bad profile stops the server before it serves a request. Holds no secret, so
 * it is importable from instrumentation and route handlers alike (no "server-only" marker).
 */

const trimUrl = (v: string | undefined, fallback: string): string => (v && v.trim() ? v.trim() : fallback).replace(/\/+$/, "");

const appEnv = (process.env.APP_ENV ?? "production").trim();
const cookieSecure = cookieSecureFromEnv(process.env.COOKIE_SECURE);

// Plain-http cookies are a laptop-only convenience (SECURITY_RULES: every cookie is Secure in UAT
// and production). Refuse to start rather than silently downgrade.
if (!cookieSecure && appEnv !== "local") {
  throw new Error(`COOKIE_SECURE=false is only allowed when APP_ENV=local (APP_ENV is "${appEnv}")`);
}

/** The three backend services the gateway may reach. Anything else is refused (allow-list). */
export const SERVICES = {
  auth: `${trimUrl(process.env.AUTH_SERVICE_URL, "http://127.0.0.1:3201")}/auth/api/v1`,
  core: `${trimUrl(process.env.CORE_SERVICE_URL, "http://127.0.0.1:3202")}/core/api/v1`,
  data: `${trimUrl(process.env.DATA_SERVICE_URL, "http://127.0.0.1:3203")}/data/api/v1`,
} as const;
export type ServiceName = keyof typeof SERVICES;
export const isServiceName = (v: string): v is ServiceName => Object.prototype.hasOwnProperty.call(SERVICES, v);

export const serverConfig = {
  appEnv,
  cookieSecure,
  webOrigin: trimUrl(process.env.WEB_ORIGIN, "http://localhost:3200"),
  upstreamTimeoutMs: Number(process.env.UPSTREAM_TIMEOUT_MS ?? 30000),
};

export const cookieNames = cookieNamesFor(process.env.SESSION_COOKIE_PREFIX);
