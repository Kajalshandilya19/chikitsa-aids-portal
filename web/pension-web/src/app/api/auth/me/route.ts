import { authedAuthCall, relay } from "@/lib/server/auth-flow";

export async function GET() {
  return relay(await authedAuthCall({ path: "auth/me" }));
}
