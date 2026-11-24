import "server-only";
import webpush from "web-push";
import { publicEnv, serverEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

let configured: boolean | null = null;

function ensureConfigured() {
  if (configured !== null) return configured;
  const { vapidPrivateKey, vapidSubject } = serverEnv();
  if (!publicEnv.vapidPublicKey || !vapidPrivateKey) return (configured = false);
  webpush.setVapidDetails(vapidSubject, publicEnv.vapidPublicKey, vapidPrivateKey);
  return (configured = true);
}

export function isPushConfigured() {
  return ensureConfigured();
}

/**
 * Sends a Web Push to every subscription the user registered. Subscriptions only exist
 * after the user granted browser permission explicitly in Settings → Notifications.
 * Payload is intentionally minimal (no private content beyond the title).
 */
export async function sendPushToUser(userId: string, payload: { title: string; body?: string; link?: string; tag?: string }) {
  if (!ensureConfigured()) return;
  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 24 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }),
  );
}
