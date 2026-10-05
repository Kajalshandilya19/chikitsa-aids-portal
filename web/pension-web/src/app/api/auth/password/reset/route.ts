import type { NextRequest } from "next/server";

import { badRequest, isOk, pick, readJsonObject, relay } from "@/lib/server/auth-flow";
import { clearSession } from "@/lib/server/session";
import { callService } from "@/lib/server/upstream";

/** Forgot password, step 2: OTP and the new password. Success ends any session of this browser. */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  const body = pick(input, ["user_code", "otp", "new_password"]);
  const r = await callService("auth", { method: "POST", path: "auth/password/reset", body: JSON.stringify(body), contentType: "application/json" });
  if (isOk(r.status) && r.body?.success) await clearSession();
  return relay(r);
}
