import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { notifyOrg, notifyPartnership } from "@/lib/notifications/notify";
import { sendTemplatedEmail } from "@/lib/notifications/email";
import { absoluteUrl } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily maintenance job (schedule via vercel.json, Supabase cron or any scheduler):
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  const secret = serverEnv().cronSecret;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const summary: Record<string, number> = {};

  // 1. Expire unanswered partnership requests.
  const { data: expired } = await admin
    .from("partnership_requests")
    .update({ status: "expired", last_activity_at: now.toISOString() })
    .in("status", ["sent", "viewed"])
    .lt("expires_at", now.toISOString())
    .select("id, sender_organization_id, subject");
  for (const r of expired ?? []) {
    await notifyOrg(r.sender_organization_id, { type: "request_rejected", title: "A partnership request expired without a response", body: r.subject, link: `/dashboard/requests/${r.id}` }, { permission: "requests.manage" });
  }
  summary.requestsExpired = expired?.length ?? 0;

  // 2. Milestones due in 3 days.
  const { data: dueSoon } = await admin
    .from("partnership_milestones")
    .select("id, title, target_date, partnership:partnerships(id, organization_a_id, organization_b_id, status)")
    .eq("target_date", format(addDays(now, 3), "yyyy-MM-dd"))
    .in("status", ["planned", "in_progress"])
    .is("deleted_at", null);
  for (const m of dueSoon ?? []) {
    const p = m.partnership as unknown as { id: string; organization_a_id: string; organization_b_id: string; status: string };
    if (p?.status === "active") await notifyPartnership(p, { type: "milestone_due", title: `Milestone due in 3 days: ${m.title}`, link: `/dashboard/partnerships/${p.id}/milestones` });
  }
  // Overdue milestones → missed.
  await admin.from("partnership_milestones").update({ status: "missed" }).in("status", ["planned", "in_progress"]).lt("target_date", today).is("deleted_at", null);
  summary.milestoneReminders = dueSoon?.length ?? 0;

  // 3. Agreements expiring within 30 days (notify once) and expired agreements.
  const { data: expiring } = await admin
    .from("partnership_agreements")
    .select("id, title, expiration_date, partnership:partnerships(id, organization_a_id, organization_b_id)")
    .eq("status", "active")
    .is("expiry_notified_at", null)
    .lte("expiration_date", format(addDays(now, 30), "yyyy-MM-dd"))
    .gte("expiration_date", today);
  for (const a of expiring ?? []) {
    const p = a.partnership as unknown as { id: string; organization_a_id: string; organization_b_id: string };
    await notifyPartnership(p, { type: "agreement", title: `Agreement expires ${format(new Date(a.expiration_date!), "d MMM yyyy")}: ${a.title}`, body: "Review renewal terms with your partner.", link: `/dashboard/partnerships/${p.id}/agreements` });
    await admin.from("partnership_agreements").update({ expiry_notified_at: now.toISOString() }).eq("id", a.id);
  }
  await admin.from("partnership_agreements").update({ status: "expired" }).eq("status", "active").lt("expiration_date", today);
  summary.agreementReminders = expiring?.length ?? 0;

  // 4. Subscription renewal reminders (7 days) and lapsed subscriptions (3-day grace).
  const { data: renewing } = await admin
    .from("subscriptions")
    .select("id, organization_id, current_period_end, organization:organizations(name), plan:subscription_plans(name, code)")
    .eq("status", "active")
    .is("renewal_notified_at", null)
    .not("current_period_end", "is", null)
    .lte("current_period_end", addDays(now, 7).toISOString())
    .gte("current_period_end", now.toISOString());
  for (const s of renewing ?? []) {
    const plan = s.plan as unknown as { name: string; code: string };
    if (plan.code === "free") continue;
    const date = format(new Date(s.current_period_end!), "d MMM yyyy");
    await notifyOrg(s.organization_id, { type: "billing", title: `Your ${plan.name} plan ends on ${date}`, body: "Renew to keep your features.", link: "/dashboard/billing" }, { permission: "billing.manage" });
    const { data: owners } = await admin.from("organization_members").select("profile:profiles!organization_members_user_id_fkey(email, full_name)").eq("organization_id", s.organization_id).eq("role", "owner");
    for (const o of owners ?? []) {
      const pr = o.profile as unknown as { email: string; full_name: string | null };
      await sendTemplatedEmail("subscription_renewal", pr.email, { name: pr.full_name ?? "there", plan: plan.name, company: (s.organization as unknown as { name: string }).name, date, link: absoluteUrl("/dashboard/billing") });
    }
    await admin.from("subscriptions").update({ renewal_notified_at: now.toISOString() }).eq("id", s.id);
  }
  summary.renewalReminders = renewing?.length ?? 0;

  const graceCutoff = addDays(now, -3).toISOString();
  const { data: lapsed } = await admin
    .from("subscriptions")
    .select("id, organization_id, status, current_period_end, trial_ends_at")
    .in("status", ["active", "trialing", "past_due"])
    .or(`current_period_end.lt.${graceCutoff},trial_ends_at.lt.${now.toISOString()}`);
  const { data: free } = await admin.from("subscription_plans").select("id").eq("code", "free").single();
  for (const s of lapsed ?? []) {
    if (!s.current_period_end && !s.trial_ends_at) continue;
    await admin.from("subscriptions").update({ status: s.status === "trialing" ? "cancelled" : "expired" }).eq("id", s.id);
    if (free) await admin.from("subscriptions").insert({ organization_id: s.organization_id, plan_id: free.id, status: "active", current_period_start: now.toISOString() });
    await notifyOrg(s.organization_id, { type: "billing", title: s.status === "trialing" ? "Your free trial has ended" : "Your subscription has expired", body: "You're now on the Free Explorer plan.", link: "/dashboard/billing" }, { permission: "billing.manage" });
  }
  summary.subscriptionsLapsed = lapsed?.length ?? 0;

  // 5. Housekeeping.
  await admin.from("rate_limits").delete().lt("window_start", addDays(now, -1).toISOString());

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), summary });
}
