import type { NextRequest } from "next/server";

import { badRequest, endSession, isOk, pick, readJsonObject, respondToLoginStep, type LoginData } from "@/lib/server/auth-flow";
import { callService, relayError, upstreamDown } from "@/lib/server/upstream";

const FIELDS = ["center_code", "user_code", "password", "captcha_token", "captcha_answer"] as const;

/**
 * Step 1 of sign-in. DONE sets the session cookies; MFA_REQUIRED / MFA_ENROLL keep the mfa_token in
 * the httpOnly `<prefix>_mfa` cookie, so the browser never sees it. A new login first ends any
 * session this browser still holds (one session per browser).
 */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  await endSession();
  const r = await callService<LoginData>("auth", { method: "POST", path: "auth/login", body: JSON.stringify(pick(input, FIELDS)), contentType: "application/json" });
  if (r.status === 503 && !r.body) return upstreamDown();
  if (!isOk(r.status) || !r.body?.success) return relayError(r.status, r.body);
  return respondToLoginStep(r.body.data);
}
