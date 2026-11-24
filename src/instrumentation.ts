/** Runs once at server start. In local demo mode, prepare the embedded database early. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PUBLIC_LOCAL_DEMO !== "1" || process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const { getLocalState } = await import("@/lib/local-supabase/db");
  getLocalState()
    .then((s) => s.seeded)
    .then(() => console.log("[local-demo] ready — local database with demo data"))
    .catch((e) => console.error("[local-demo] failed to start local database", e));
}
