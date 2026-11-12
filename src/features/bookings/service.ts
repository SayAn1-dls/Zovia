import "server-only";

import type { ServiceContext, UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger } from "@/server/logger";

import { getPaymentProvider } from "./payment-provider";
import * as payments from "./payment-repository";
import * as repo from "./repository";
import type { Booking, PaymentOrder, RequestBookingInput, RespondBookingInput, VerifyPaymentInput } from "./schemas";

/**
 * Demo payments: product-owner request so the booking flow can be completed locally without a
 * gateway account. Never in production builds, never when Razorpay is configured, and the
 * payment is stored with provider 'demo' and shown as "Demo payment, no money moved".
 */
export function demoPaymentsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && env().PAYMENTS_DEMO_MODE && getPaymentProvider() === null && payments.canRecordPayments();
}

export async function confirmDemoPayment(ctx: UserServiceContext, bookingId: string): Promise<{ booking_id: string }> {
  if (!demoPaymentsEnabled()) throw errors.forbidden("Demo payments are not enabled.");
  await repo.payableAmountPaise(ctx.supabase, bookingId); // as the seeker: theirs, accepted, in time
  return { booking_id: await payments.confirmDemoPayment(bookingId) };
}

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
 * Creates a Razorpay order for an accepted booking. The amount comes from the database (as the
 * seeker, so RLS + the function check ownership and state); the client sends only the id.
 */
export async function createPaymentOrder(ctx: UserServiceContext, bookingId: string): Promise<PaymentOrder> {
  const provider = getPaymentProvider();
  if (!provider || !payments.canRecordPayments()) {
    if (demoPaymentsEnabled()) {
      await repo.payableAmountPaise(ctx.supabase, bookingId);
      return { status: "demo" };
    }
    return { status: "not_configured" };
  }

  const amountPaise = await repo.payableAmountPaise(ctx.supabase, bookingId);
  const booking = await getBooking(ctx, bookingId);
  const { orderId } = await provider.createOrder({
    amountPaise,
    receipt: `bk_${bookingId.slice(0, 30)}`,
    notes: { booking_id: bookingId },
  });
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
 * Browser callback after Checkout: verify the signature with our secret, then ask Razorpay for
 * the real amount before confirming (the browser's word is never enough).
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
  const payment = await provider.fetchPayment(input.razorpay_payment_id);
  if (payment.orderId !== input.razorpay_order_id || !["authorized", "captured"].includes(payment.status)) {
    throw errors.badRequest("That payment is not complete.");
  }
  const bookingId = await payments.confirmPayment(input.razorpay_order_id, input.razorpay_payment_id, payment.amountPaise);
  return { booking_id: bookingId };
}

/** Razorpay webhook (payment.captured / payment.failed). Signature already verified by the route. */
export async function handleWebhookEvent(event: {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } };
}): Promise<void> {
  const entity = event.payload?.payment?.entity;
  if (!entity?.order_id || !entity.id) return;
  if (event.event === "payment.captured" || event.event === "order.paid") {
    await payments.confirmPayment(entity.order_id, entity.id, Number(entity.amount));
  } else if (event.event === "payment.failed") {
    await payments.failPayment(entity.order_id);
  }
}
