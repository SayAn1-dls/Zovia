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

export async function confirmPayment(orderId: string, paymentId: string, amountPaise: number): Promise<string> {
  const { data, error } = await admin().rpc("confirm_booking_payment", {
    p_order_id: orderId,
    p_payment_id: paymentId,
    p_amount_paise: amountPaise,
  });
  if (error) throw fromSupabaseError(error);
  return data as string;
}

export async function failPayment(orderId: string): Promise<void> {
  const { error } = await admin().rpc("fail_payment", { p_order_id: orderId });
  if (error) throw fromSupabaseError(error);
}
