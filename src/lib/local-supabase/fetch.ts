import "server-only";
import { LOCAL_ANON_KEY, LOCAL_INTERNAL_URL, LOCAL_SERVICE_KEY, demoPassword } from "./config";

/**
 * A fetch() that answers supabase-js requests in-process instead of over the
 * network. The handler (and the embedded database) load lazily, so nothing is
 * pulled in unless local demo mode is actually used.
 */
export function localFetch(opts: { seeding?: boolean } = {}): typeof fetch {
  return async (input, init) => {
    const { handleLocalRequest } = await import("./handler");
    const req = input instanceof Request ? input : new Request(input instanceof URL ? input.href : String(input), init);
    return handleLocalRequest(req, { trusted: true, seeding: opts.seeding });
  };
}

export function localSupabaseClients(opts: { seeding?: boolean } = {}) {
  return { url: LOCAL_INTERNAL_URL, anonKey: LOCAL_ANON_KEY, serviceKey: LOCAL_SERVICE_KEY, fetch: localFetch(opts), password: demoPassword() };
}
