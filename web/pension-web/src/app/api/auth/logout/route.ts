import { authedAuthCall } from "@/lib/server/auth-flow";
import { clearSession } from "@/lib/server/session";
import { jsonOk } from "@/lib/server/upstream";

/** Revoke the session at auth-service (refreshing first if the access token has expired), then drop every cookie. */
export async function POST() {
  await authedAuthCall({ method: "POST", path: "auth/logout", body: "{}", contentType: "application/json" }).catch(() => null);
  await clearSession();
  return jsonOk({ logged_out: true });
}
