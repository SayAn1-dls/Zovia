import "server-only";

import { after } from "next/server";

import { getPaymentProvider, type PaymentProvider } from "@/features/bookings/payment-provider";
import { capturedPayment, refundSafely } from "@/features/bookings/payment-settlement";
import { errors, fromSupabaseError } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

import { loadInvoiceForEmail } from "./invoice-store";
import { notifyStayEvent } from "./notifications";
import type { StayPaymentPort, StayBookingRow } from "./ports";
import type { StayPayment } from "./schemas";

/**
 * Online payment for stay bookings (docs/stay-booking.md). Razorpay orders are for the booking's
 * grand total in paise, as stored by book_stay(); an open order is re-used. Only a payment that
 * Razorpay reports as captured confirms a booking, and money that cannot be honoured (paid after
 * the hold ran out and the beds went, after a cancellation, or twice) is refunded.
 *
 * SERVICE-ROLE writes (allow-listed in eslint.config.mjs): the SQL functions it calls are granted to
 * service_role only, and every call follows a verified provider signature or a booking the caller
 * already read through their own session.
 */

type PaymentState = {
  booking_id: string;
  status: string;
  paid: boolean;
  payable: boolean;
  order_id: string | null;
  amount_paise: number;
  user_id: string;
};

type PaidOutcome = "confirmed" | "already_paid" | "refund_needed" | "duplicate";

function admin() {
  const client = createSupabaseAdminClient();
  if (!client) throw errors.unavailable("Online payment is not available right now.");
  return client;
}

function provider(): PaymentProvider {
  const configured = getPaymentProvider();
  if (!configured) throw errors.unavailable("Online payment is not set up.");
  return configured;
}

async function paymentState(bookingId: string): Promise<PaymentState | null> {
  const { data, error } = await admin().rpc("stay_payment_state", { p_booking_id: bookingId });
  if (error) throw fromSupabaseError(error);
  return (data as PaymentState | null) ?? null;
}

function describe(booking: StayBookingRow): string {
  const nights = `${booking.nights} night${booking.nights === 1 ? "" : "s"}`;
  const beds = `${booking.guests} bed${booking.guests === 1 ? "" : "s"}`;
  return `Zovia stay: ${nights}, ${beds}`;
}

/** Issues the refund recorded on a booking (refund_due) through the provider, and records the result. */
export async function refundStayBooking(bookingId: string): Promise<void> {
  const { data, error } = await admin()
    .from("stay_bookings")
    .select("provider_payment_id, refund_inr, refund_status, paid")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  if (!data?.paid || !data.provider_payment_id || data.refund_status !== "refund_due" || data.refund_inr <= 0) return;
  const refund = await refundSafely(getPaymentProvider(), data.provider_payment_id, data.refund_inr * 100, {
    stay_booking_id: bookingId,
  });
  if (!refund) return; // stays refund_due for the team; already logged
  const { error: markError } = await admin().rpc("mark_stay_refund", {
    p_booking_id: bookingId,
    p_status: refund.status,
    p_refund_id: refund.refundId,
  });
  if (markError) throw fromSupabaseError(markError);
}

/**
 * Records a captured payment against a stay booking's order. Returns false when the order is not a
 * stay order (the caller then tries the long-stay bookings), true once handled.
 */
export async function settleStayPayment(
  configured: PaymentProvider,
  orderId: string,
  paymentId: string,
  amountPaise: number,
): Promise<boolean> {
  const client = createSupabaseAdminClient();
  if (!client) return false;
  const { data, error } = await client.rpc("mark_stay_paid", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_paise: amountPaise,
  });
  if (error) {
    const appError = fromSupabaseError(error);
    if (appError.code === "not_found") return false;
    throw appError;
  }
  const { booking_id, outcome } = data as { booking_id: string; outcome: PaidOutcome };
  if (outcome === "confirmed") {
    announceConfirmed(booking_id);
  } else if (outcome === "refund_needed") {
    logger.warn("payments.stay_refund_needed", { stay_booking_id: booking_id, order_id: orderId });
    await refundStayBooking(booking_id);
  } else if (outcome === "duplicate") {
    // Not recorded on the booking: refund this payment as a whole.
    logger.warn("payments.stay_duplicate_payment", { stay_booking_id: booking_id, order_id: orderId, payment_id: paymentId });
    await refundSafely(configured, paymentId, amountPaise, { stay_booking_id: booking_id, reason: "duplicate" });
  }
  return true;
}

/**
 * Tells the team and the guest (receipt e-mail) that a paid booking is confirmed, after the response
 * is sent: the webhook must answer Razorpay quickly and the browser should not wait for e-mail.
 * Runs once per booking, because mark_stay_paid() reports `confirmed` only for the first payment.
 */
function announceConfirmed(bookingId: string): void {
  const task = async () => {
    try {
      const invoice = await loadInvoiceForEmail(bookingId);
      if (!invoice) return;
      await notifyStayEvent("confirmed", invoice.booking, { loadInvoice: async () => invoice });
    } catch (thrown) {
      logger.warn("stays.confirmed_notify_failed", { stay_booking_id: bookingId, error: serializeError(thrown) });
    }
  };
  try {
    after(task);
  } catch {
    void task(); // outside a request (scripts, tests)
  }
}

/** Closes holds that ran out and stays that ended. For a Vercel cron (pg_cron may be missing). */
export async function expireStayHolds(): Promise<number> {
  const { data, error } = await admin().rpc("expire_stay_holds");
  if (error) throw fromSupabaseError(error);
  return (data as number | null) ?? 0;
}

export function createStayPayments(): StayPaymentPort {
  return {
    configured() {
      return getPaymentProvider() !== null && createSupabaseAdminClient() !== null;
    },

    async instructionFor(booking): Promise<StayPayment> {
      if (booking.payment_mode === "at_property") return { mode: "at_property" };
      const razorpay = provider();
      const state = await paymentState(booking.id);
      if (!state?.payable) throw errors.conflict("This booking is not waiting for payment.");

      let orderId = state.order_id;
      if (!orderId) {
        const created = await razorpay.createOrder({
          amountPaise: state.amount_paise,
          receipt: `st_${booking.id.slice(0, 30)}`,
          notes: { stay_booking_id: booking.id },
        });
        // If another request stored an order first, the database returns that one; ours stays unused.
        const { data, error } = await admin().rpc("record_stay_order", {
          p_booking_id: booking.id,
          p_order_id: created.orderId,
          p_amount_paise: state.amount_paise,
        });
        if (error) throw fromSupabaseError(error);
        orderId = data as string;
      }
      return {
        mode: "online",
        provider: "razorpay",
        key_id: razorpay.keyId,
        order_id: orderId,
        amount_paise: state.amount_paise,
        currency: "INR",
        description: describe(booking),
      };
    },

    async verifyCheckout({ razorpay_order_id, razorpay_payment_id, razorpay_signature }) {
      const razorpay = provider();
      const valid = razorpay.verifyCheckoutSignature({
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id,
        signature: razorpay_signature,
      });
      if (!valid) {
        logger.warn("payments.stay_bad_checkout_signature", { order_id: razorpay_order_id });
        throw errors.badRequest("We could not verify that payment. If money was taken, it will be confirmed shortly or refunded.");
      }
      const { data: booking, error } = await admin()
        .from("stay_bookings")
        .select("id")
        .eq("provider_order_id", razorpay_order_id)
        .maybeSingle();
      if (error) throw fromSupabaseError(error);
      if (!booking) throw errors.notFound("Booking not found.");

      const { amountPaise } = await capturedPayment(razorpay, razorpay_payment_id, razorpay_order_id);
      await settleStayPayment(razorpay, razorpay_order_id, razorpay_payment_id, amountPaise);
      return { booking_id: booking.id };
    },
  };
}
