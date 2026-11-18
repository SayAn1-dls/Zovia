import "server-only";

import { settleStayPayment } from "@/features/stays/payment";
import type { ServiceContext, UserServiceContext } from "@/server/auth/context";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import { getPaymentProvider, type PaymentProvider } from "./payment-provider";
import { capturedPayment, refundSafely } from "./payment-settlement";
import * as payments from "./payment-repository";
import * as repo from "./repository";
import type { Booking, PaymentOrder, RequestBookingInput, RespondBookingInput, VerifyPaymentInput } from "./schemas";

export function paymentsConfigured(): boolean {
  return getPaymentProvider() !== null && payments.canRecordPayments();
}

export async function requestBooking(ctx: UserServiceContext, input: RequestBookingInput): Promise<{ id: string }> {
  return { id: await repo.requestBooking(ctx.supabase, input) };
}

export function listMyBookings(ctx: UserServiceContext): Promise<Booking[]> {
  return repo.listBookings(ctx.supabase, { seekerId: ctx.user.id });
}

export function listOwnerBookings(ctx: UserServiceContext): Promise<Booking[]> {
  return repo.listBookings(ctx.supabase, { ownerId: ctx.user.id });
}

export async function getBooking(ctx: ServiceContext, id: string): Promise<Booking> {
  const booking = await repo.getBooking(ctx.supabase, id);
  if (!booking) throw errors.notFound("Booking not found.");
  return booking;
}

export function respondToBooking(ctx: UserServiceContext, id: string, input: RespondBookingInput): Promise<void> {
  return repo.respondBooking(ctx.supabase, id, input.accept, input.reason);
}

export function cancelBooking(ctx: UserServiceContext, id: string, reason?: string): Promise<void> {
  return repo.cancelBooking(ctx.supabase, id, reason);
}

/**
 * Razorpay order for an accepted booking. The amount comes from the database (as the seeker, so
 * RLS + the function check ownership and state); the client sends only the id. An open order of
 * the same amount is re-used, so paying in two tabs cannot charge twice.
 */
export async function createPaymentOrder(ctx: UserServiceContext, bookingId: string): Promise<PaymentOrder> {
  const provider = getPaymentProvider();
  if (!provider || !payments.canRecordPayments()) return { status: "not_configured" };

  const amountPaise = await repo.payableAmountPaise(ctx.supabase, bookingId);
  const booking = await getBooking(ctx, bookingId);
  let orderId = await payments.openPaymentOrder(bookingId);
  if (!orderId) {
    ({ orderId } = await provider.createOrder({
      amountPaise,
      receipt: `bk_${bookingId.slice(0, 30)}`,
      notes: { booking_id: bookingId },
    }));
  }
  await payments.recordPaymentOrder(bookingId, orderId, amountPaise);
  return {
    status: "ready",
    provider: "razorpay",
    key_id: provider.keyId,
    order_id: orderId,
    amount_paise: amountPaise,
    currency: "INR",
    description: booking.property.title.slice(0, 250),
  };
}

/**
 * Records a captured payment and returns money that cannot be honoured (paid twice, or after the
 * booking closed) through the provider.
 */
async function settleBookingPayment(provider: PaymentProvider, orderId: string, paymentId: string, amountPaise: number): Promise<string> {
  const { bookingId, outcome } = await payments.confirmPayment(orderId, paymentId, amountPaise);
  if (outcome === "refund_needed" || outcome === "duplicate") {
    logger.warn("payments.booking_refund_needed", { booking_id: bookingId, order_id: orderId, payment_id: paymentId, outcome });
    const refund = await refundSafely(provider, paymentId, amountPaise, { booking_id: bookingId, reason: outcome });
    if (outcome === "refund_needed" && refund) await payments.markPaymentRefund(orderId, refund.status, refund.refundId);
  }
  return bookingId;
}

/**
 * Browser callback after Checkout: verify the signature with our secret, check the order is the
 * caller's, then ask Razorpay for the real, captured amount before confirming (the browser's word
 * is never enough).
 */
export async function verifyCheckoutPayment(ctx: UserServiceContext, input: VerifyPaymentInput): Promise<{ booking_id: string }> {
  const provider = getPaymentProvider();
  if (!provider) throw errors.unavailable("Online payment is not set up.");
  const valid = provider.verifyCheckoutSignature({
    orderId: input.razorpay_order_id,
    paymentId: input.razorpay_payment_id,
    signature: input.razorpay_signature,
  });
  if (!valid) {
    logger.warn("payments.bad_checkout_signature", { request_id: ctx.requestId, user_id: ctx.user.id });
    throw errors.badRequest("We could not verify that payment. If money was taken, it will be confirmed shortly or refunded.");
  }
  if (!(await repo.orderBelongsToSeeker(ctx.supabase, input.razorpay_order_id, ctx.user.id))) {
    throw errors.notFound("Booking not found.");
  }
  const { amountPaise } = await capturedPayment(provider, input.razorpay_payment_id, input.razorpay_order_id);
  const bookingId = await settleBookingPayment(provider, input.razorpay_order_id, input.razorpay_payment_id, amountPaise);
  return { booking_id: bookingId };
}

type WebhookEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } };
};

/**
 * Razorpay webhook. Signature already verified by the route. Stay bookings and long-stay bookings
 * share one Razorpay account: an order that belongs to a stay booking is settled there, any other
 * order here.
 *   payment.authorized  capture it (the captured event then settles it)
 *   payment.captured / order.paid  settle
 *   payment.failed  mark a long-stay order failed (a stay hold simply runs out)
 */
export async function handleWebhookEvent(event: WebhookEvent): Promise<void> {
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id || !entity.id) return;
  const provider = getPaymentProvider();
  if (!provider) return;
  const amountPaise = Number(entity.amount);

  if (event.event === "payment.authorized") {
    await provider.capturePayment(entity.id, amountPaise).catch((thrown: unknown) => {
      logger.warn("payments.webhook_capture_failed", { payment_id: entity.id, error: serializeError(thrown) });
    });
  } else if (event.event === "payment.captured" || event.event === "order.paid") {
    if (event.event === "order.paid" && entity.status !== "captured") return;
    if (await settleStayPayment(provider, entity.order_id, entity.id, amountPaise)) return;
    await settleBookingPayment(provider, entity.order_id, entity.id, amountPaise);
  } else if (event.event === "payment.failed") {
    await payments.failPayment(entity.order_id);
  }
}
