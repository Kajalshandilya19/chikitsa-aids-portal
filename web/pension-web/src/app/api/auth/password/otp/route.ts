import { authedAuthCall, relay } from "@/lib/server/auth-flow";

/** Sends the first-login OTP to the user's registered mobile. Answers with the masked number only. */
export async function POST() {
  return relay(await authedAuthCall({ method: "POST", path: "auth/password/otp", body: "{}", contentType: "application/json" }));
}
