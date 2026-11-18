import "server-only";

import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import type { PaymentProvider } from "./payment-provider";

/**
 * Steps shared by every payment flow (long-stay bookings and stay bookings): only money that
 * Razorpay reports as `captured` confirms anything, and money we cannot honour goes back.
 */

/**
 * The payment as Razorpay reports it, captured. An `authorized` payment is captured first (with
 * auto-capture off it would otherwise be refunded by Razorpay days later while we show it as paid).
 */
export async function capturedPayment(
  provider: PaymentProvider,
  paymentId: string,
  orderId: string,
): Promise<{ amountPaise: number }> {
  let payment = await provider.fetchPayment(paymentId);
  if (payment.orderId !== orderId) throw errors.badRequest("That payment belongs to a different order.");
  if (payment.status === "authorized") {
    try {
      await provider.capturePayment(paymentId, payment.amountPaise);
    } catch (thrown) {
      // Another path (webhook or the browser) may have captured it a moment ago: look again.
      logger.warn("payments.capture_retry", { payment_id: paymentId, error: serializeError(thrown) });
    }
    payment = await provider.fetchPayment(paymentId);
  }
  if (payment.status !== "captured") throw errors.badRequest("That payment is not complete.");
  return { amountPaise: payment.amountPaise };
}

/**
 * Refunds a payment through the provider. Never throws: a failed refund is logged loudly and the
 * record stays `refund_due` for the team. Returns the refund status to record, or null on failure.
 */
export async function refundSafely(
  provider: PaymentProvider | null,
  paymentId: string,
  amountPaise: number,
  notes: Record<string, string>,
): Promise<{ status: "pending" | "refunded"; refundId: string } | null> {
  if (!provider || amountPaise <= 0) return null;
  try {
    const refund = await provider.refundPayment(paymentId, amountPaise, notes);
    logger.info("payments.refunded", { payment_id: paymentId, refund_id: refund.refundId, status: refund.status, ...notes });
    return { status: refund.status === "processed" ? "refunded" : "pending", refundId: refund.refundId };
  } catch (thrown) {
    logger.error("payments.refund_failed", { payment_id: paymentId, amount_paise: amountPaise, ...notes, error: serializeError(thrown) });
    return null;
  }
}
