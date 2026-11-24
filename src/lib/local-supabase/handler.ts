import "server-only";
import { LOCAL_ANON_KEY, LOCAL_BASE_PATH, LOCAL_SERVICE_KEY } from "./config";
import { getLocalState, type RequestRole } from "./db";
import { handleAuth, userFromToken } from "./auth";
import { handleRest } from "./rest";
import { handleStorage } from "./storage";
import { json } from "./http";

export type HandlerOptions = {
  /** In-process callers (server code) may use the service key; HTTP callers never can. */
  trusted: boolean;
  /** Requests made by the seeder run before demo data is ready. */
  seeding?: boolean;
};

/** Routes a supabase-js request to the local REST / Auth / Storage stand-ins. */
export async function handleLocalRequest(req: Request, opts: HandlerOptions): Promise<Response> {
  const url = new URL(req.url);
  const at = url.pathname.indexOf(LOCAL_BASE_PATH);
  // trailingSlash builds (static preview) redirect /token to /token/; the API paths never end in "/".
  const rel = (at >= 0 ? url.pathname.slice(at + LOCAL_BASE_PATH.length) : url.pathname).replace(/(.)\/+$/, "$1");

  try {
    const state = await getLocalState();
    if (!opts.seeding) await state.seeded;
    const { db, meta, jwtSecret } = state;

    const apikey = req.headers.get("apikey");
    const auth = req.headers.get("authorization");
    const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;

    let role: RequestRole = { kind: "anon" };
    if (bearer === LOCAL_SERVICE_KEY || (!bearer && apikey === LOCAL_SERVICE_KEY)) {
      if (!opts.trusted) return json({ message: "The service key can only be used by server code." }, 401);
      role = { kind: "service" };
    } else if (bearer && bearer !== LOCAL_ANON_KEY) {
      const user = await userFromToken(db, jwtSecret, bearer);
      // A stale session (e.g. after "Reset data" rebuilt the database) is treated as
      // signed out rather than failing every request; the proxy then clears its cookies.
      role = user ? { kind: "user", userId: user.id, email: user.email } : { kind: "anon" };
    } else if (apikey !== LOCAL_ANON_KEY && apikey !== LOCAL_SERVICE_KEY && !rel.startsWith("/storage/v1/object/public/") && !rel.startsWith("/storage/v1/object/sign/") && !rel.startsWith("/auth/v1/authorize")) {
      return json({ message: "No API key found in request" }, 401);
    }

    if (rel.startsWith("/rest/v1")) return await handleRest(req, rel.slice("/rest/v1".length), db, meta, role);
    if (rel.startsWith("/auth/v1")) return await handleAuth(req, rel.slice("/auth/v1".length), db, jwtSecret, role, bearer);
    if (rel.startsWith("/storage/v1")) return await handleStorage(req, rel.slice("/storage/v1".length), db, jwtSecret, role);
    return json({ message: `Not available in local demo mode: ${rel}` }, 404);
  } catch (e) {
    console.error("[local-demo] request failed", req.method, rel, e);
    return json({ code: "XX000", message: (e as Error).message ?? "Local demo error", details: null, hint: null }, 500);
  }
}
