import { callService, jsonOk, relayError } from "@/lib/server/upstream";

interface Captcha {
  image: string;
  token: string;
  expires_in: number;
}

/**
 * A fresh captcha (single use, 5 minutes). Public.
 * Only image, token and expiry reach the browser. The auth-service adds `dev_answer` when
 * APP_ENV=local (for the smoke scripts, which call the service directly); the browser never gets it.
 */
export async function GET() {
  const { status, body } = await callService<Captcha>("auth", { path: "captcha" });
  if (status !== 200 || !body?.success) return relayError(status, body);
  const { image, token, expires_in } = body.data;
  return jsonOk({ image, token, expires_in });
}
