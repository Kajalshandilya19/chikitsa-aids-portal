import type { NextRequest } from "next/server";

import { badRequest, pick, readJsonObject, relay } from "@/lib/server/auth-flow";
import { callService } from "@/lib/server/upstream";

/** Forgot password, step 1. Always the same generic answer, whether or not the details match. */
export async function POST(request: NextRequest) {
  const input = await readJsonObject(request);
  if (!input) return badRequest();
  const body = pick(input, ["user_code", "mobile", "captcha_token", "captcha_answer"]);
  return relay(await callService("auth", { method: "POST", path: "auth/password/forgot", body: JSON.stringify(body), contentType: "application/json" }));
}
