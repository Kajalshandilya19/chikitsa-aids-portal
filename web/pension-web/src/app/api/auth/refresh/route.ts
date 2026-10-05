import { clearSession, getRefreshToken, setSession } from "@/lib/server/session";
import { jsonError, jsonOk, rotateTokens } from "@/lib/server/upstream";

/** Rotate the refresh token and mint a new access cookie. Called by the browser helper on a 401. */
export async function POST() {
  const refresh = await getRefreshToken();
  if (!refresh) return jsonError(401, "E_NO_SESSION", "Please log in");
  const rotated = await rotateTokens(refresh);
  if (!rotated) {
    await clearSession();
    return jsonError(401, "E_SESSION_EXPIRED", "Your session has ended, please log in again");
  }
  await setSession(rotated);
  return jsonOk({ refreshed: true });
}
