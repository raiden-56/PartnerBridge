"use client";
import { createBrowserClient } from "@supabase/ssr";
import { publicEnv } from "@/lib/env";
import { LOCAL_BASE_PATH, LOCAL_COOKIE_NAME } from "@/lib/local-supabase/config";

let client: ReturnType<typeof createBrowserClient> | undefined;

/** Browser client (anon key + user session cookie). Used for Realtime and reads under RLS. */
export function createClient() {
  if (!client) {
    client = publicEnv.localDemo
      ? // Local demo: talk to the stand-in API on this app's own origin.
        createBrowserClient(`${window.location.origin}${publicEnv.basePath}${LOCAL_BASE_PATH}`, publicEnv.supabaseAnonKey, { cookieOptions: { name: LOCAL_COOKIE_NAME } })
      : createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  }
  return client;
}
