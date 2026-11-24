import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const readSetting = cache(async (key: string): Promise<unknown> => {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("platform_settings").select("value").eq("key", key).maybeSingle();
    return data?.value ?? undefined;
  } catch {
    return undefined;
  }
});

/** Platform settings are admin-only under RLS; read them server-side with the service client. */
export async function getPlatformSetting<T>(key: string, fallback: T): Promise<T> {
  const v = await readSetting(key);
  return (v as T) ?? fallback;
}
