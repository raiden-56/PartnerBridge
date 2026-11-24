"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireUser } from "@/lib/auth/session";
import { NOTIFICATION_TYPES } from "@/lib/notifications/types";

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("read_at", null);
    if (error) dbError(error);
    return { ok: true };
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
    if (error) dbError(error);
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "All notifications marked as read" };
  });
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", user.id);
    if (error) dbError(error);
    revalidatePath("/dashboard/notifications");
    return { ok: true };
  });
}

const prefsSchema = z.record(z.string(), z.object({ in_app: z.boolean(), email: z.boolean(), push: z.boolean() }));

export async function saveNotificationPreferencesAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const prefs = prefsSchema.parse(raw);
    for (const k of Object.keys(prefs)) if (!(k in NOTIFICATION_TYPES)) throw new UserFacingError("Unknown notification type");
    const supabase = await createClient();
    const { error } = await supabase.from("notification_preferences").upsert({ user_id: user.id, preferences: prefs, updated_at: new Date().toISOString() });
    if (error) dbError(error);
    return { ok: true, message: "Notification preferences saved" };
  });
}

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(5).max(100) }),
});

/** Stores a Web Push subscription. Only called after the user granted browser permission. */
export async function savePushSubscriptionAction(raw: unknown, userAgent?: string): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const sub = subSchema.parse(raw);
    const supabase = await createClient();
    // Endpoint is unique across users; remove any stale row for this device first (own rows only under RLS).
    await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({ user_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: userAgent?.slice(0, 300) });
    if (error) dbError(error);
    return { ok: true, message: "Push notifications enabled on this device" };
  });
}

export async function removePushSubscriptionAction(endpoint: string): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await requireUser();
    const supabase = await createClient();
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
    return { ok: true, message: "Push notifications disabled on this device" };
  });
}
