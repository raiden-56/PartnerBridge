import "server-only";
import crypto from "node:crypto";
import { publicEnv, serverEnv } from "@/lib/env";

/**
 * Payment-provider abstraction. Razorpay is implemented; additional providers
 * (Stripe, Cashfree, PayU…) can be added by implementing PaymentProvider and
 * registering them in `getPaymentProvider`.
 */
export interface CreateOrderInput {
  amountMinor: number; // paise
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}

export interface PaymentProvider {
  name: "razorpay" | "demo";
  isConfigured(): boolean;
  publicKey(): string;
  createOrder(input: CreateOrderInput): Promise<{ id: string; amount: number; currency: string }>;
  /** Verify checkout callback signature (order_id|payment_id) — server side only. */
  verifyPaymentSignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Verify webhook payload signature against the raw request body. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
}

function timingSafeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

const razorpay: PaymentProvider = {
  name: "razorpay",
  isConfigured() {
    const e = serverEnv();
    return Boolean(e.razorpayKeyId && e.razorpayKeySecret);
  },
  publicKey() {
    return serverEnv().razorpayKeyId;
  },
  async createOrder(input) {
    const { razorpayKeyId, razorpayKeySecret } = serverEnv();
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${razorpayKeyId}:${razorpayKeySecret}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ amount: input.amountMinor, currency: input.currency, receipt: input.receipt, notes: input.notes }),
    });
    if (!res.ok) throw new Error(`Razorpay order failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { id: string; amount: number; currency: string };
    return json;
  },
  verifyPaymentSignature(orderId, paymentId, signature) {
    const expected = crypto
      .createHmac("sha256", serverEnv().razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return timingSafeEqualHex(expected, signature);
  },
  verifyWebhookSignature(rawBody, signature) {
    const secret = serverEnv().razorpayWebhookSecret;
    if (!secret) return false;
    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    return timingSafeEqualHex(expected, signature);
  },
};

/**
 * Local demo mode only: simulated checkout, no money moves and no external
 * calls. Payments are completed by a server action that re-checks local demo
 * mode, so this provider can never activate a plan in a real deployment.
 */
const demo: PaymentProvider = {
  name: "demo",
  isConfigured: () => publicEnv.localDemo,
  publicKey: () => "demo",
  async createOrder(input) {
    return { id: `demo_order_${crypto.randomUUID()}`, amount: input.amountMinor, currency: input.currency };
  },
  verifyPaymentSignature: () => false,
  verifyWebhookSignature: () => false,
};

export function getPaymentProvider(): PaymentProvider {
  return publicEnv.localDemo ? demo : razorpay;
}
