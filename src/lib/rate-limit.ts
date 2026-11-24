import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { UserFacingError } from "@/lib/actions";
import { getPlatformSetting } from "@/lib/settings";

type LimitKey =
  | "partnership_requests_per_hour"
  | "messages_per_minute"
  | "applications_per_hour"
  | "auth_per_10_minutes"
  | "contact_per_hour"
  | "reports_per_hour";

const WINDOWS: Record<LimitKey, number> = {
  partnership_requests_per_hour: 3600,
  messages_per_minute: 60,
  applications_per_hour: 3600,
  auth_per_10_minutes: 600,
  contact_per_hour: 3600,
  reports_per_hour: 3600,
};

const DEFAULTS: Record<LimitKey, number> = {
  partnership_requests_per_hour: 10,
  messages_per_minute: 30,
  applications_per_hour: 10,
  auth_per_10_minutes: 10,
  contact_per_hour: 5,
  reports_per_hour: 10,
};

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Database-backed fixed-window rate limiter (works across serverless instances).
 * Fails open if the database is unreachable so legitimate users are not locked out.
 */
export async function enforceRateLimit(key: LimitKey, subject: string) {
  try {
    const limits = await getPlatformSetting<Partial<Record<LimitKey, number>>>("rate_limits", {});
    const limit = limits[key] ?? DEFAULTS[key];
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: `${key}:${subject}`,
      p_limit: limit,
      p_window_seconds: WINDOWS[key],
    });
    if (error) return;
    if (data === false) throw new UserFacingError("You're doing that too often. Please wait a moment and try again.");
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
  }
}
