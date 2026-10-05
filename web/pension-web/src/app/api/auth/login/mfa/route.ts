import type { NextRequest } from "next/server";

import { badRequest, isOk, pick, readJsonObject, respondToLoginStep, type LoginData } from "@/lib/server/auth-flow";
import { clearMfaToken, getMfaToken } from "@/lib/server/session";
import { callService, jsonError, relayError, upstreamDown } from "@/lib/server/upstream";

/** Step 2 of sign-in: the 6 digit TOTP code, with the mfa_token read from the httpOnly cookie. */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  const mfaToken = await getMfaToken();
  if (!mfaToken) return jsonError(401, "E_MFA_EXPIRED", "The sign-in step has expired, please log in again");
  const body = { mfa_token: mfaToken, ...pick(input, ["totp_code"]) };
  const r = await callService<LoginData>("auth", { method: "POST", path: "auth/login/mfa", body: JSON.stringify(body), contentType: "application/json" });
  if (r.status === 503 && !r.body) return upstreamDown();
  if (!isOk(r.status) || !r.body?.success) {
    // A locked or expired mfa_token cannot be used again: drop it so the user starts over.
    if (r.status === 401 || r.body?.code === "E_MFA_LOCKED") await clearMfaToken();
    return relayError(r.status, r.body);
  }
  return respondToLoginStep(r.body.data);
}
