import { NextResponse, type NextRequest } from "next/server";

import { NO_STORE } from "@/lib/security-headers";
import { isServiceName } from "@/lib/server/config";
import { getAccessToken } from "@/lib/server/session";
import { jsonError, upstreamDown, upstreamFetch } from "@/lib/server/upstream";

/**
 * Generic BFF proxy: /api/gateway/<service>/<path> -> <SERVICE_URL>/<service>/api/v1/<path>.
 *
 *   - `<service>` is an allow-list: auth | core | data. Anything else is 404.
 *   - A first path segment of `internal` is 404: service-token routes are never reachable from a browser.
 *   - A session is required (401 E_NO_SESSION otherwise). The access token goes upstream as
 *     `Authorization: Bearer`; the browser's Cookie header is never forwarded (lib/server/upstream.ts).
 *   - JSON and multipart bodies are forwarded byte for byte with their content-type (the multipart
 *     boundary included). Responses are streamed back, binary ones (xlsx downloads) with their
 *     content-type and content-disposition.
 *   - On 401 the browser helper (lib/client/api.ts) refreshes through /api/auth/refresh and retries
 *     once: the refresh cookie is scoped to /api/auth and is not visible to this route.
 */
type Ctx = { params: Promise<{ service: string; path: string[] }> };

/** Upload limit is 10 MB (IMPORT_MAX_FILE_MB); leave room for the multipart envelope. */
const MAX_BODY_BYTES = 11 * 1024 * 1024;
// Not content-length or content-encoding: fetch has already decoded a compressed body, so they would lie.
const PASS_HEADERS = ["content-type", "content-disposition", "x-request-id", "retry-after"];
const SAFE_SEGMENT = /^[A-Za-z0-9._~-]+$/;

async function forward(request: NextRequest, ctx: Ctx) {
  const { service, path } = await ctx.params;
  if (!isServiceName(service)) return jsonError(404, "E_NOT_FOUND", "not found");
  if (!path?.length || path[0]!.toLowerCase() === "internal" || path.some((s) => s === "." || s === ".." || !SAFE_SEGMENT.test(s))) {
    return jsonError(404, "E_NOT_FOUND", "not found");
  }

  const token = await getAccessToken();
  if (!token) return jsonError(401, "E_NO_SESSION", "Please log in");

  const method = request.method.toUpperCase();
  let body: ArrayBuffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return jsonError(413, "E_FILE_TOO_LARGE", "The request is too large");
    body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return jsonError(413, "E_FILE_TOO_LARGE", "The request is too large");
  }

  let res: Response;
  try {
    res = await upstreamFetch(service, {
      method,
      path: path.join("/"),
      search: request.nextUrl.search,
      token,
      body: body && body.byteLength > 0 ? body : null,
      contentType: body ? request.headers.get("content-type") : null,
      accept: request.headers.get("accept"),
      incoming: request.headers,
    });
  } catch {
    return upstreamDown();
  }

  const out = new Headers({ "cache-control": NO_STORE });
  for (const h of PASS_HEADERS) {
    const v = res.headers.get(h);
    if (v) out.set(h, v);
  }
  return new NextResponse(res.body, { status: res.status, headers: out });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
