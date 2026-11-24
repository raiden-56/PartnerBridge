import { NextResponse } from "next/server";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUser, AuthError } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Personal data export (DPDP data-access right). Returns data the user can already see under RLS. */
export async function GET() {
  try {
    const { user } = await requireUser();
    await enforceRateLimit("contact_per_hour", `export:${user.id}`);
    const supabase = await createClient();
    const [profile, memberships, notifications, prefs, messages, tasks, comments, activity] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("organization_members").select("organization_id, role, permissions, joined_at, organization:organizations(name, slug)").eq("user_id", user.id),
      supabase.from("notifications").select("type, title, body, link, read_at, created_at").eq("user_id", user.id),
      supabase.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("partnership_messages").select("conversation_id, body, created_at").eq("sender_id", user.id),
      supabase.from("partnership_tasks").select("partnership_id, title, status, created_at").eq("created_by", user.id),
      supabase.from("task_comments").select("task_id, body, created_at").eq("author_id", user.id),
      supabase.from("activity_logs").select("action, summary, created_at").eq("actor_id", user.id).limit(2000),
    ]);
    await createAdminClient().from("data_export_requests").insert({ user_id: user.id, kind: "export" });
    const body = JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        note: "Personal data export from PartnerBridge. Company data shared with partners is governed by those companies.",
        account: { id: user.id, email: user.email, created_at: user.created_at },
        profile: profile.data,
        memberships: memberships.data,
        notification_preferences: prefs.data,
        notifications: notifications.data,
        messages_sent: messages.data,
        tasks_created: tasks.data,
        task_comments: comments.data,
        activity: activity.data,
      },
      null,
      2,
    );
    return new NextResponse(body, {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="partnerbridge-my-data-${format(new Date(), "yyyyMMdd")}.json"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
