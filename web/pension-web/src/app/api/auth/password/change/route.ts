import type { NextRequest } from "next/server";

import { authedAuthCall, badRequest, isOk, pick, readJsonObject, relay } from "@/lib/server/auth-flow";
import { clearSession } from "@/lib/server/session";

/** Change password. On success every session of the user is revoked, so the cookies go too. */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  const r = await authedAuthCall({ method: "POST", path: "auth/password/change", body: JSON.stringify(pick(input, ["current_password", "new_password", "otp"])), contentType: "application/json" });
  if (isOk(r.status) && r.body?.success) await clearSession();
  return relay(r);
}
