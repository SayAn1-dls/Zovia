import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

import { enrichBooking } from "./enrich";
import type { StayInvoice } from "./invoice";
import type { StayBookingRow } from "./ports";

/**
 * SERVICE-ROLE read of a booking's receipt, for the confirmation e-mail only (allow-listed in
 * eslint.config.mjs). It runs after a verified payment or the guest's own booking call, where there
 * may be no user session (the payment webhook). Guests read receipts through get_stay_invoice().
 * Returns null without the service-role key or when the booking has no receipt yet.
 */
export async function loadInvoiceForEmail(bookingId: string): Promise<StayInvoice | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;
  const { data, error } = await client.rpc("service_get_stay_invoice", { p_booking_id: bookingId });
  if (error) throw fromSupabaseError(error);
  if (!data) return null;
  const raw = data as unknown as { invoice_no: string; issued_at: string; booking: StayBookingRow };
  return { invoice_no: raw.invoice_no, issued_at: raw.issued_at, booking: enrichBooking(raw.booking) };
}
