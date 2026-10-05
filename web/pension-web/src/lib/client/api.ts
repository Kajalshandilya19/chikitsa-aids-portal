"use client";

import { COOKIE_NAMES, CSRF_HEADER } from "@/lib/cookie-names";
import { isMutating } from "@/lib/csrf";
import { findXss } from "@/lib/input-security";

/**
 * THE browser-side way to call the BFF. Every screen goes through `api.*` (or `apiFetch` for the
 * rare raw call); nothing calls `fetch("/api/...")` directly.
 *
 *   - credentials same-origin; `X-CSRF-Token` from the `<prefix>_csrf` cookie on POST/PUT/PATCH/DELETE
 *   - refuses to send a JSON body that carries script markup (lib/input-security.ts mirrors the
 *     services' xss-guard), so the user gets the message without a round trip
 *   - parses the envelope: `{ success, data, meta }` or `{ success:false, code, message, details, request_id }`
 *   - 401 on a gateway / auth call: one refresh through /api/auth/refresh (single flight), then one
 *     retry; when the refresh fails the session is over and the browser goes to /login?expired=1
 *   - E_PASSWORD_CHANGE_REQUIRED: the browser goes to /change-password
 */

export interface Meta {
  page: number;
  limit: number;
  total: number;
}

/** A failed call: `code` for branching, `message` for the toast, `details` for field errors. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export const qs = (params?: QueryParams): string => {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
};

/** `/api/gateway/<service>/<path>`: the only way screens address a service. */
export type ServiceName = "auth" | "core" | "data";
export const gw = (service: ServiceName, path: string): string => `/api/gateway/${service}/${path.replace(/^\/+/, "")}`;

export function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_NAMES.csrf}=`));
  return hit ? decodeURIComponent(hit.slice(COOKIE_NAMES.csrf.length + 1)) : null;
}

/** Routes where a 401 means "wrong credentials / no session yet", never "refresh and retry". */
const NO_REFRESH = ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout", "/api/auth/captcha", "/api/auth/password/forgot", "/api/auth/password/reset"];
const SESSION_CODES = new Set(["E_TOKEN_INVALID", "E_NO_TOKEN", "E_NO_SESSION", "E_SESSION_EXPIRED", "E_UNAUTHORIZED"]);

let refreshing: Promise<boolean> | null = null;

/** One refresh at a time for the whole tab: concurrent 401s share it. */
function refreshOnce(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin", headers: csrfHeaders() })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { [CSRF_HEADER]: token } : {};
}

/** Leave for the login page once; later calls in the same tick do nothing. */
let leaving = false;
export function goToLogin(reason: "expired" | "logout" = "expired"): void {
  if (leaving || typeof window === "undefined") return;
  leaving = true;
  window.location.assign(reason === "expired" ? "/login?expired=1" : "/login");
}

async function peekCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.clone().json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

/** Low level: fetch with CSRF, refresh-once on 401, and the password-change redirect. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (isMutating(method)) for (const [k, v] of Object.entries(csrfHeaders())) headers.set(k, v);
  const go = () => fetch(input, { ...init, method, headers, credentials: "same-origin", cache: "no-store" });

  let res = await go();
  const path = input.split("?")[0] ?? input;
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    const code = await peekCode(res);
    if (code === null || SESSION_CODES.has(code)) {
      if (await refreshOnce()) res = await go();
      if (res.status === 401) {
        goToLogin("expired");
        return res;
      }
    }
  }
  if (res.status === 403 && (await peekCode(res)) === "E_PASSWORD_CHANGE_REQUIRED" && typeof window !== "undefined" && window.location.pathname !== "/change-password") {
    window.location.assign("/change-password");
  }
  return res;
}

async function parse<T>(res: Response): Promise<{ data: T; meta?: Meta }> {
  let body: { success?: boolean; data?: T; meta?: Meta; code?: string; message?: string; details?: unknown; request_id?: string } | null = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON */
  }
  if (!res.ok || !body?.success) {
    throw new ApiError(res.status, body?.code ?? "E_HTTP", body?.message ?? `Request failed (${res.status})`, body?.details, body?.request_id);
  }
  return { data: body.data as T, meta: body.meta };
}

/** Refuse script markup before it leaves the browser (the service refuses it too: E_UNSAFE_INPUT). */
function guardBody(body: unknown): void {
  const hit = findXss(body);
  if (hit) throw new ApiError(400, "E_UNSAFE_INPUT", "This value contains characters that are not allowed (possible script or markup). Please remove them.", { field: hit });
}

function jsonInit(method: string, body?: unknown): RequestInit {
  if (body instanceof FormData) return { method, body };
  if (body === undefined) return { method, headers: { "content-type": "application/json" }, body: "{}" };
  guardBody(body);
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

export const api = {
  /** GET a URL (a BFF route or `gw(...)`) and return `data`. */
  async get<T>(url: string, params?: QueryParams): Promise<T> {
    return (await parse<T>(await apiFetch(`${url}${qs(params)}`))).data;
  },
  /** GET with the paging meta. */
  async getPage<T>(url: string, params?: QueryParams): Promise<{ data: T; meta?: Meta }> {
    return parse<T>(await apiFetch(`${url}${qs(params)}`));
  },
  async post<T>(url: string, body?: unknown): Promise<T> {
    return (await parse<T>(await apiFetch(url, jsonInit("POST", body)))).data;
  },
  async put<T>(url: string, body?: unknown): Promise<T> {
    return (await parse<T>(await apiFetch(url, jsonInit("PUT", body)))).data;
  },
  async patch<T>(url: string, body?: unknown): Promise<T> {
    return (await parse<T>(await apiFetch(url, jsonInit("PATCH", body)))).data;
  },
  async del<T>(url: string): Promise<T> {
    return (await parse<T>(await apiFetch(url, { method: "DELETE" }))).data;
  },
  /** A file download (xlsx template, export). Returns the blob and the server's file name. */
  async download(url: string): Promise<{ blob: Blob; fileName: string | null }> {
    const res = await apiFetch(url, { headers: { accept: "*/*" } });
    if (!res.ok) await parse(res);
    const cd = res.headers.get("content-disposition") ?? "";
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    return { blob: await res.blob(), fileName: m?.[1] ? decodeURIComponent(m[1]) : null };
  },
};

/** Save a blob as a file (anchor click; the object URL is released straight after). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Server-side field errors (zod issues) as `{ field: message }`, for react-hook-form's setError. */
export const fieldErrors = (err: unknown): Record<string, string> => {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  const out: Record<string, string> = {};
  for (const d of err.details as { path?: unknown; field?: unknown; message?: unknown }[]) {
    const key = Array.isArray(d.path) ? d.path.join(".") : typeof d.path === "string" ? d.path : typeof d.field === "string" ? d.field : null;
    if (key && typeof d.message === "string" && !out[key]) out[key] = d.message;
  }
  return out;
};
