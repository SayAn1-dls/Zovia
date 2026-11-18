import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/server/env";
import { errors } from "@/server/http/errors";

/**
 * Payment provider abstraction (spec section 14.2). Razorpay is the only implementation; it is
 * enabled only when RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are all set.
 * Without them `getPaymentProvider()` returns null and callers report "not configured"; nothing
 * ever pretends a payment succeeded.
 */
export type PaymentProvider = {
  name: "razorpay";
  /** Public key id for the browser checkout. */
  keyId: string;
  createOrder(input: { amountPaise: number; receipt: string; notes: Record<string, string> }): Promise<{ orderId: string }>;
  /** Checkout handler signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
  verifyCheckoutSignature(input: { orderId: string; paymentId: string; signature: string }): boolean;
  /** Webhook signature: HMAC-SHA256(raw body, webhook_secret). */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  /** Amount actually captured/authorised for a payment, from Razorpay itself. */
  fetchPayment(paymentId: string): Promise<{ orderId: string; amountPaise: number; status: string }>;
  /** Captures an `authorized` payment, so it is not auto-refunded by Razorpay days later. */
  capturePayment(paymentId: string, amountPaise: number): Promise<void>;
  /** Refunds a captured payment in full or in part. `processed` once the money is on its way back. */
  refundPayment(
    paymentId: string,
    amountPaise: number,
    notes: Record<string, string>,
  ): Promise<{ refundId: string; status: "pending" | "processed" }>;
};

function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(received, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

const API = "https://api.razorpay.com/v1";

function razorpay(keyId: string, keySecret: string, webhookSecret: string): PaymentProvider {
  const authorization = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        ...init,
        headers: { Authorization: authorization, "Content-Type": "application/json", ...init.headers },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
    } catch (cause) {
      throw errors.unavailable("The payment service did not respond. Please try again.", { cause });
    }
    if (!response.ok) {
      throw errors.unavailable("The payment service refused the request. Please try again.", {
        cause: new Error(`razorpay ${path} -> ${response.status}`),
      });
    }
    return (await response.json()) as T;
  }

  return {
    name: "razorpay",
    keyId,
    async createOrder({ amountPaise, receipt, notes }) {
      const order = await call<{ id: string }>("/orders", {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, notes }),
      });
      return { orderId: order.id };
    },
    verifyCheckoutSignature({ orderId, paymentId, signature }) {
      return safeEqualHex(hmacHex(keySecret, `${orderId}|${paymentId}`), signature.toLowerCase());
    },
    verifyWebhookSignature(rawBody, signature) {
      return safeEqualHex(hmacHex(webhookSecret, rawBody), signature.toLowerCase());
    },
    async fetchPayment(paymentId) {
      const payment = await call<{ order_id: string; amount: number; status: string }>(
        `/payments/${encodeURIComponent(paymentId)}`,
      );
      return { orderId: payment.order_id, amountPaise: payment.amount, status: payment.status };
    },
    async capturePayment(paymentId, amountPaise) {
      await call(`/payments/${encodeURIComponent(paymentId)}/capture`, {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, currency: "INR" }),
      });
    },
    async refundPayment(paymentId, amountPaise, notes) {
      const refund = await call<{ id: string; status: string }>(`/payments/${encodeURIComponent(paymentId)}/refund`, {
        method: "POST",
        body: JSON.stringify({ amount: amountPaise, notes }),
      });
      return { refundId: refund.id, status: refund.status === "processed" ? "processed" : "pending" };
    },
  };
}

export function getPaymentProvider(): PaymentProvider | null {
  const { RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET } = env();
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET || !RAZORPAY_WEBHOOK_SECRET) return null;
  return razorpay(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET);
}
