import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/env";
import { LOCAL_COOKIE_NAME } from "@/lib/local-supabase/config";
import { localFetch } from "@/lib/local-supabase/fetch";

/** Supabase client bound to the current user's session. All queries are subject to RLS. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    ...(publicEnv.localDemo ? { cookieOptions: { name: LOCAL_COOKIE_NAME }, global: { fetch: localFetch() } } : {}),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — session refresh is handled by the proxy.
        }
      },
    },
  });
}
