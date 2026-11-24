"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { GUEST_PERSONAS, demoPassword, isLocalDemo, type GuestPersona } from "@/lib/local-supabase/config";

/**
 * Guest mode (local demo only): one click signs in as a seeded demo persona.
 * Refused outright unless the app runs in local demo mode, so it can never
 * open a back door into a real deployment.
 */
export async function guestSignInAction(persona: GuestPersona): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction<{ redirectTo: string }>(async () => {
    if (!isLocalDemo()) throw new UserFacingError("Guest mode is only available in local demo mode.");
    const p = GUEST_PERSONAS.find((x) => x.key === persona);
    if (!p) throw new UserFacingError("Unknown guest persona.");
    const supabase = await createClient();
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: p.email, password: demoPassword() });
    if (error) throw new UserFacingError("Demo data isn't ready yet — wait a few seconds and try again.");
    revalidatePath("/", "layout");
    return { ok: true, data: { redirectTo: persona === "admin" || persona === "moderator" ? "/admin" : "/dashboard" }, message: `Signed in as ${p.label} (guest)` };
  });
}

/** Wipes the local database and reloads the original demo data. */
export async function resetDemoDataAction(): Promise<ActionResult> {
  return runAction(async () => {
    if (!isLocalDemo()) throw new UserFacingError("Only available in local demo mode.");
    const supabase = await createClient();
    await supabase.auth.signOut().catch(() => undefined);
    const { resetLocalDemo } = await import("@/lib/local-supabase/db");
    await resetLocalDemo();
    revalidatePath("/", "layout");
    return { ok: true, message: "Demo data has been reset" };
  });
}
