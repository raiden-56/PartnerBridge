import { publicEnv } from "@/lib/env";
import { getUser } from "@/lib/auth/session";
import { DemoModeBar } from "./guest-mode";

/** Renders the local-demo bar only when the app runs in local demo mode. */
export async function LocalDemoBar() {
  if (!publicEnv.localDemo) return null;
  const user = await getUser();
  return <DemoModeBar signedInEmail={user?.email ?? null} />;
}
