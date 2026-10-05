import { redirect } from "next/navigation";

/** No public pages: the root goes to the dashboard (the proxy sends a signed-out browser on to /login). */
export default function Root() {
  redirect("/dashboard");
}
