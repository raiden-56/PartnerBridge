import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/billing/provider";
import { markPaymentFailed, markPaymentPaid } from "@/lib/billing/service";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Razorpay webhook. Configure in Razorpay Dashboard → Webhooks with events
 * payment.captured, order.paid and payment.failed, using RAZORPAY_WEBHOOK_SECRET.
 * The signature is verified against the raw body; events are processed idempotently.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!getPaymentProvider().verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: { event: string; payload: { payment?: { entity: { id: string; order_id: string; error_description?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${event.event}:${event.payload.payment?.entity.id ?? Date.now()}`;
  const admin = createAdminClient();
  const { error: dupe } = await admin.from("webhook_events").insert({ id: eventId, provider: "razorpay", event_type: event.event, payload: event as unknown as Record<string, unknown> });
  if (dupe?.code === "23505") return NextResponse.json({ ok: true, duplicate: true });

  try {
    const p = event.payload.payment?.entity;
    if (p && (event.event === "payment.captured" || event.event === "order.paid")) {
      await markPaymentPaid(p.order_id, p.id, { webhook: event.event });
    } else if (p && event.event === "payment.failed") {
      await markPaymentFailed(p.order_id, p.error_description ?? "Payment failed", { webhook: event.event });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[razorpay webhook]", e);
    // Allow Razorpay to retry.
    await admin.from("webhook_events").delete().eq("id", eventId);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
