import { authedAuthCall, relay } from "@/lib/server/auth-flow";

/** The caller's active assignments (for the switch dialog). */
export async function GET() {
  return relay(await authedAuthCall({ path: "auth/options" }));
}
