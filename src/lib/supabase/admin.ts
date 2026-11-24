import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";
import { LOCAL_SERVICE_KEY } from "@/lib/local-supabase/config";
import { localFetch } from "@/lib/local-supabase/fetch";

/**
 * Service-role client. BYPASSES RLS — only use in server code AFTER an explicit
 * authorization check (see lib/auth/session.ts). Never import from client code.
 */
export function createAdminClient() {
  if (publicEnv.localDemo) {
    return createClient(publicEnv.supabaseUrl, LOCAL_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: localFetch() },
    });
  }
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
