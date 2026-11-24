/**
 * Local demo mode — runs PartnerBridge with an embedded Postgres (PGlite) and a
 * built-in stand-in for the Supabase APIs (REST, Auth, Storage), seeded with
 * fictional demo data. Enabled with NEXT_PUBLIC_LOCAL_DEMO=1.
 *
 * It is meant for local development and demos only. It never runs when a real
 * Supabase project is configured.
 */

/** Path (on this app's own origin) that the browser uses to reach the local API. */
export const LOCAL_BASE_PATH = "/local-sb";

/** Placeholder URL used by server-side clients; requests never leave the process. */
export const LOCAL_INTERNAL_URL = "http://local-supabase.internal" + LOCAL_BASE_PATH;

/** Not secrets: these only identify the caller type to the in-process stand-in. */
export const LOCAL_ANON_KEY = "local-demo-anon-key";
export const LOCAL_SERVICE_KEY = "local-demo-service-key";

/** Fixed auth cookie name so server and browser agree regardless of host/port. */
export const LOCAL_COOKIE_NAME = "sb-local-demo-auth-token";

export function isLocalDemo() {
  return process.env.NEXT_PUBLIC_LOCAL_DEMO === "1" && !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Shared password of all seeded demo accounts. */
export function demoPassword() {
  return process.env.SEED_DEMO_PASSWORD || "Demo@PartnerBridge2026";
}

export const DEMO_DOMAIN = "partnerbridge.demo";

/** One-click guest personas shown in local demo mode. */
export const GUEST_PERSONAS = [
  { key: "owner", email: `northstar@${DEMO_DOMAIN}`, label: "Company owner", description: "Aarav Mehta · Northstar Digital Solutions" },
  { key: "manager", email: `manager@${DEMO_DOMAIN}`, label: "Partnership manager", description: "Neha Kapoor · Northstar Digital Solutions" },
  { key: "admin", email: `admin@${DEMO_DOMAIN}`, label: "Platform admin", description: "Full admin console" },
  { key: "moderator", email: `moderator@${DEMO_DOMAIN}`, label: "Moderator", description: "Verification & reports" },
] as const;

export type GuestPersona = (typeof GUEST_PERSONAS)[number]["key"];
