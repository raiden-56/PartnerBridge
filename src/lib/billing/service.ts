import "server-only";
import { addMonths, addYears } from "date-fns";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyOrg } from "@/lib/notifications/notify";
import { logActivity } from "@/lib/activity";

/**
 * Marks a payment as paid and activates/extends the subscription. Idempotent:
 * safe to call from both the checkout verification endpoint and the webhook.
 * Callers MUST have verified the provider signature before calling.
 */
export async function markPaymentPaid(orderId: string, paymentId: string, raw: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("*").eq("provider_order_id", orderId).maybeSingle();
  if (!payment) return { ok: false as const, reason: "unknown_order" };
  if (payment.status === "paid") return { ok: true as const, already: true, subscriptionId: payment.subscription_id as string | null };

  const { data: seq } = await admin.rpc("next_invoice_number");
  const now = new Date();

  // Extend from the current period end if renewing the same plan, else start now.
  const { data: live } = await admin
    .from("subscriptions")
    .select("*")
    .eq("organization_id", payment.organization_id)
    .in("status", ["trialing", "active", "past_due"])
    .maybeSingle();

  const sameplan = live && live.plan_id === payment.plan_id && live.status === "active";
  const start = sameplan && live.current_period_end && new Date(live.current_period_end) > now ? new Date(live.current_period_end) : now;
  const end = payment.billing_cycle === "yearly" ? addYears(start, 1) : addMonths(start, 1);

  let subscriptionId: string;
  if (live) {
    const { data, error } = await admin
      .from("subscriptions")
      .update({
        plan_id: payment.plan_id,
        status: "active",
        billing_cycle: payment.billing_cycle,
        current_period_start: sameplan ? live.current_period_start : now.toISOString(),
        current_period_end: end.toISOString(),
        cancel_at_period_end: false,
        cancelled_at: null,
        provider: payment.provider ?? "razorpay",
        trial_ends_at: null,
        renewal_notified_at: null,
      })
      .eq("id", live.id)
      .select("id")
      .single();
    if (error) throw error;
    subscriptionId = data.id;
  } else {
    const { data, error } = await admin
      .from("subscriptions")
      .insert({
        organization_id: payment.organization_id,
        plan_id: payment.plan_id,
        status: "active",
        billing_cycle: payment.billing_cycle,
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        provider: payment.provider ?? "razorpay",
      })
      .select("id")
      .single();
    if (error) throw error;
    subscriptionId = data.id;
  }

  const { error: payErr } = await admin
    .from("payments")
    .update({
      status: "paid",
      provider_payment_id: paymentId,
      paid_at: now.toISOString(),
      subscription_id: subscriptionId,
      invoice_number: `PB-${now.getFullYear()}-${seq ?? Date.now()}`,
      raw,
    })
    .eq("id", payment.id)
    .neq("status", "paid");
  if (payErr) throw payErr;

  await logActivity({
    organizationId: payment.organization_id,
    actorId: payment.initiated_by,
    action: "billing.payment_succeeded",
    entityType: "payment",
    entityId: payment.id,
    summary: "Subscription payment received",
  });
  await notifyOrg(
    payment.organization_id,
    { type: "billing", title: "Payment received — subscription active", body: `Invoice PB-${now.getFullYear()}-${seq ?? ""} is available on the Billing page.`, link: "/dashboard/billing" },
    { permission: "billing.manage" },
  );
  return { ok: true as const, already: false, subscriptionId };
}

export async function markPaymentFailed(orderId: string, reason: string, raw: Record<string, unknown> = {}) {
  const admin = createAdminClient();
  const { data: payment } = await admin.from("payments").select("id, organization_id, status").eq("provider_order_id", orderId).maybeSingle();
  if (!payment || payment.status === "paid") return;
  await admin.from("payments").update({ status: "failed", failure_reason: reason.slice(0, 500), raw }).eq("id", payment.id);
  await notifyOrg(
    payment.organization_id,
    { type: "billing", title: "Payment failed", body: reason.slice(0, 200), link: "/dashboard/billing" },
    { permission: "billing.manage" },
  );
}
