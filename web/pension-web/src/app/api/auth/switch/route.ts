import type { NextRequest } from "next/server";

import { authedAuthCall, badRequest, isOk, pick, readJsonObject, respondToLoginStep, type LoginData } from "@/lib/server/auth-flow";
import { relayError, upstreamDown } from "@/lib/server/upstream";

/** Switch assignment: auth-service ends this session and starts one in the chosen assignment. */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  const r = await authedAuthCall<LoginData>({ method: "POST", path: "auth/switch", body: JSON.stringify(pick(input, ["assignment_id"])), contentType: "application/json" });
  if (r.status === 503 && !r.body) return upstreamDown();
  if (!isOk(r.status) || !r.body?.success) return relayError(r.status, r.body);
  return respondToLoginStep(r.body.data);
}
