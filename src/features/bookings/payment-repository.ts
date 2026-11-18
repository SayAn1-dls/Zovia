import "server-only";

import { errors, fromSupabaseError } from "@/server/http/errors";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

/**
 * SERVICE-ROLE writes for payments (allow-listed in eslint.config.mjs, spec 14.2). Callers must
 * have verified the provider's signature first; the SQL functions re-check that the amount
 * matches the booking. Without SUPABASE_SERVICE_ROLE_KEY payments cannot be recorded, and that
 * is reported as "unavailable", never faked.
 */
function admin() {
  const client = createSupabaseAdminClient();
  if (!client) throw errors.unavailable("Online payment is not available right now.");
  return client;
}

export function canRecordPayments(): boolean {
  return createSupabaseAdminClient() !== null;
}

export async function recordPaymentOrder(bookingId: string, orderId: string, amountPaise: number): Promise<void> {
  const { error } = await admin().rpc("record_payment_order", {
    p_booking_id: bookingId,
    p_order_id: orderId,
    p_amount_paise: amountPaise,
  });
  if (error) throw fromSupabaseError(error);
}

/** The open (unpaid) order of a booking that still matches its amount, re-used instead of a new one. */
export async function openPaymentOrder(bookingId: string): Promise<string | null> {
  const { data, error } = await admin().rpc("open_payment_order", { p_booking_id: bookingId });
  if (error) throw fromSupabaseError(error);
  return (data as string | null) ?? null;
}

/**
 * - confirmed / already_paid: nothing else to do
 * - refund_needed: money for a booking that is no longer waiting for it (recorded as refund_due)
 * - duplicate: a second payment on an already paid order (not recorded)
 */
export type ConfirmOutcome = "confirmed" | "already_paid" | "refund_needed" | "duplicate";

export async function confirmPayment(
  orderId: string,
  paymentId: string,
  amountPaise: number,
): Promise<{ bookingId: string; outcome: ConfirmOutcome }> {
  const { data, error } = await admin().rpc("confirm_booking_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_paise: amountPaise,
  });
  if (error) throw fromSupabaseError(error);
  const result = data as { booking_id: string; outcome: ConfirmOutcome };
  return { bookingId: result.booking_id, outcome: result.outcome };
}

export async function markPaymentRefund(orderId: string, status: "pending" | "refunded" | "refund_due", refundId?: string): Promise<void> {
  const { error } = await admin().rpc("mark_payment_refund", {
    p_order_id: orderId,
    p_status: status,
    ...(refundId ? { p_refund_id: refundId } : {}),
  });
  if (error) throw fromSupabaseError(error);
}

/** Expires unanswered requests and unpaid acceptances (pg_cron may be missing). Returns rows changed. */
export async function expireStaleBookings(): Promise<number> {
  const { data, error } = await admin().rpc("expire_stale_bookings");
  if (error) throw fromSupabaseError(error);
  return (data as number | null) ?? 0;
}

export async function failPayment(orderId: string): Promise<void> {
  const { error } = await admin().rpc("fail_payment", { p_order_id: orderId });
  if (error) throw fromSupabaseError(error);
}
