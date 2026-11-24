import { isLocalDemo } from "@/lib/local-supabase/config";

/**
 * Browser-facing entry to the local demo stand-in (REST / Auth / Storage).
 * Returns 404 unless local demo mode is on. Requests here are untrusted: the
 * service key is rejected and every query runs under RLS as the signed-in user.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  if (!isLocalDemo()) return new Response("Not found", { status: 404 });
  const { handleLocalRequest } = await import("@/lib/local-supabase/handler");
  return handleLocalRequest(req, { trusted: false });
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD };
