import { callService, jsonOk, relayError } from "@/lib/server/upstream";
import type { LoginCenter } from "@/lib/api-types";

/** Active Centers for the login screen's Center picker (code, name, district only). Public. */
export async function GET() {
  const { status, body } = await callService<LoginCenter[]>("auth", { path: "public/centers" });
  if (status !== 200 || !body?.success) return relayError(status, body);
  return jsonOk(body.data);
}
