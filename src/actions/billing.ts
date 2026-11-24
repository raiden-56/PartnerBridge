"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { addDays } from "date-fns";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAction, dbError, UserFacingError, type ActionResult } from "@/lib/actions";
import { requireOrg } from "@/lib/auth/session";
import { getPaymentProvider } from "@/lib/billing/provider";
import { markPaymentFailed, markPaymentPaid } from "@/lib/billing/service";
import { publicEnv } from "@/lib/env";
import { getEntitlement } from "@/lib/billing/entitlements";
import { logActivity, audit } from "@/lib/activity";

const checkoutSchema = z.object({ planCode: z.string().min(2).max(40), cycle: z.enum(["monthly", "yearly"]) });

export interface CheckoutSession {
  keyId: string;
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
  companyName: string;
  email: string;
  name: string;
}

/** Creates a provider order + pending payment row. Amount is always computed server-side from the plan. */
export async function startCheckoutAction(raw: unknown): Promise<ActionResult<CheckoutSession>> {
  return runAction<CheckoutSession>(async () => {
    const ctx = await requireOrg("billing.manage");
    const { planCode, cycle } = checkoutSchema.parse(raw);
    const provider = getPaymentProvider();
    if (!provider.isConfigured()) throw new UserFacingError("Online payments are not configured yet (Razorpay keys missing). Contact the platform administrator.");
    const admin = createAdminClient();
    const { data: plan } = await admin.from("subscription_plans").select("*").eq("code", planCode).eq("is_active", true).maybeSingle();
    if (!plan || plan.is_custom_pricing) throw new UserFacingError("This plan can't be purchased online. Contact sales.");
    const amount = Number(cycle === "monthly" ? plan.price_monthly : plan.price_yearly);
    if (amount <= 0) throw new UserFacingError("Free plans don't require payment.");

    const { data: payment, error } = await admin
      .from("payments")
      .insert({ organization_id: ctx.orgId, plan_id: plan.id, billing_cycle: cycle, provider: provider.name, amount, currency: plan.currency, status: "created", initiated_by: ctx.userId })
      .select("id")
      .single();
    if (error) dbError(error);
    const order = await provider.createOrder({
      amountMinor: Math.round(amount * 100),
      currency: plan.currency,
      receipt: payment!.id,
      notes: { organization_id: ctx.orgId, plan: plan.code, cycle, payment_id: payment!.id },
    });
    await admin.from("payments").update({ provider_order_id: order.id }).eq("id", payment!.id);
    return {
      ok: true,
      data: {
        keyId: provider.publicKey(),
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        planName: plan.name,
        companyName: ctx.membership.organization.name,
        email: ctx.profile.email,
        name: ctx.profile.full_name ?? "",
      },
    };
  });
}

/**
 * Called by the browser after Razorpay Checkout completes. We NEVER trust that
 * callback alone: the HMAC signature is verified server-side with the key secret.
 * The webhook performs the same idempotent activation independently.
 */
export async function verifyCheckoutAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("billing.manage");
    const input = z.object({ orderId: z.string().min(5), paymentId: z.string().min(5), signature: z.string().min(10) }).parse(raw);
    const admin = createAdminClient();
    const { data: payment } = await admin.from("payments").select("organization_id").eq("provider_order_id", input.orderId).maybeSingle();
    if (!payment || payment.organization_id !== ctx.orgId) throw new UserFacingError("Payment not found");
    if (!getPaymentProvider().verifyPaymentSignature(input.orderId, input.paymentId, input.signature)) {
      await audit(ctx.userId, "billing.signature_mismatch", "payment", input.orderId);
      throw new UserFacingError("Payment verification failed. If you were charged, it will be reconciled automatically.");
    }
    await markPaymentPaid(input.orderId, input.paymentId, { source: "checkout_callback" });
    revalidatePath("/dashboard/billing");
    return { ok: true, message: "Payment verified — your plan is active" };
  });
}

/**
 * Local demo mode only: completes a simulated checkout. Refused unless the app
 * runs in local demo mode and the order was created by the demo provider.
 */
export async function completeDemoPaymentAction(raw: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("billing.manage");
    const input = z.object({ orderId: z.string().startsWith("demo_order_"), outcome: z.enum(["success", "failure"]) }).parse(raw);
    if (!publicEnv.localDemo || getPaymentProvider().name !== "demo") throw new UserFacingError("Demo payments are only available in local demo mode.");
    const admin = createAdminClient();
    const { data: payment } = await admin.from("payments").select("organization_id, provider").eq("provider_order_id", input.orderId).maybeSingle();
    if (!payment || payment.organization_id !== ctx.orgId || payment.provider !== "demo") throw new UserFacingError("Payment not found");
    if (input.outcome === "failure") {
      await markPaymentFailed(input.orderId, "Simulated failure (local demo)", { source: "local_demo" });
      revalidatePath("/dashboard/billing");
      return { ok: true, message: "Simulated a failed payment — your plan is unchanged" };
    }
    await markPaymentPaid(input.orderId, `demo_pay_${crypto.randomUUID()}`, { source: "local_demo" });
    revalidatePath("/dashboard/billing");
    return { ok: true, message: "Demo payment completed — your plan is active" };
  });
}

export async function startTrialAction(planCode: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("billing.manage");
    const admin = createAdminClient();
    const { data: plan } = await admin.from("subscription_plans").select("id, name, trial_days, is_active").eq("code", planCode).maybeSingle();
    if (!plan?.is_active || !plan.trial_days) throw new UserFacingError("This plan has no free trial.");
    const { count } = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).not("trial_ends_at", "is", null);
    if (count) throw new UserFacingError("Your company has already used its free trial.");
    const ent = await getEntitlement(ctx.orgId);
    if (ent.planCode !== "free") throw new UserFacingError("Trials are available only from the Free plan.");

    await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("organization_id", ctx.orgId).in("status", ["trialing", "active", "past_due"]);
    const ends = addDays(new Date(), plan.trial_days).toISOString();
    const { error } = await admin.from("subscriptions").insert({ organization_id: ctx.orgId, plan_id: plan.id, status: "trialing", billing_cycle: "monthly", current_period_start: new Date().toISOString(), current_period_end: ends, trial_ends_at: ends });
    if (error) dbError(error);
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: "billing.trial_started", summary: `${plan.name} trial started (${plan.trial_days} days)` });
    revalidatePath("/", "layout");
    return { ok: true, message: `Your ${plan.trial_days}-day ${plan.name} trial has started` };
  });
}

export async function cancelSubscriptionAction(resume = false): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await requireOrg("billing.manage");
    const admin = createAdminClient();
    const { data: sub } = await admin.from("subscriptions").select("id, status, plan:subscription_plans(code)").eq("organization_id", ctx.orgId).in("status", ["trialing", "active", "past_due"]).maybeSingle();
    if (!sub || (sub.plan as unknown as { code: string })?.code === "free") throw new UserFacingError("No paid subscription to change.");
    if (sub.status === "trialing" && !resume) {
      // Ending a trial reverts to Free immediately.
      await admin.from("subscriptions").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", sub.id);
      const { data: free } = await admin.from("subscription_plans").select("id").eq("code", "free").single();
      await admin.from("subscriptions").insert({ organization_id: ctx.orgId, plan_id: free!.id, status: "active", current_period_start: new Date().toISOString() });
    } else {
      await admin.from("subscriptions").update({ cancel_at_period_end: !resume, cancelled_at: resume ? null : new Date().toISOString() }).eq("id", sub.id);
    }
    await logActivity({ organizationId: ctx.orgId, actorId: ctx.userId, action: resume ? "billing.resumed" : "billing.cancelled", summary: resume ? "Subscription renewal resumed" : "Subscription cancellation scheduled" });
    revalidatePath("/dashboard/billing");
    return { ok: true, message: resume ? "Your subscription will renew" : "Cancellation scheduled for the end of the current period" };
  });
}
