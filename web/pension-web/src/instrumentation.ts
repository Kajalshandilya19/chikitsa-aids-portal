/**
 * Runs once when the server process starts. Importing the server config validates the profile
 * (e.g. COOKIE_SECURE=false outside APP_ENV=local throws), so a misconfigured pod fails at boot
 * instead of on its first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/server/config");
  }
}
