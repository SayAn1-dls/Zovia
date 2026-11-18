import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";
import type { AppSupabaseClient } from "@/server/supabase/types";

import { enrichBooking } from "./enrich";
import type { StayInvoice } from "./invoice";
import { refundStayBooking } from "./payment";
import type { RawRoomAvailability, StayBookingRow, StayRepository } from "./ports";

/**
 * Stay bookings through the caller's own session. Every call is a database function that checks
 * who is asking with auth.uid(): getBooking, listBookings and cancelBooking return or touch ONLY the
 * signed-in user's bookings, even for staff (staff use staff_get_stay_booking). Prices and nightly
 * availability are computed in SQL, never taken from the caller. See
 * supabase/migrations/20261120000100_stay_bookings.sql.
 */
export function createStayRepository(supabase: AppSupabaseClient): StayRepository {
  const repo: StayRepository = {
    async availability(listing, checkin, checkout) {
      const { data, error } = await supabase.rpc("stay_availability", {
        p_listing: listing,
        p_checkin: checkin,
        p_checkout: checkout,
      });
      if (error) throw fromSupabaseError(error);
      return (data ?? []) as unknown as RawRoomAvailability[];
    },

    async createBooking(input) {
      const { data, error } = await supabase.rpc("book_stay", {
        p_listing: input.listing,
        p_checkin: input.checkin,
        p_checkout: input.checkout,
        p_rooms: input.rooms.map((room) => ({ room_type: room.room_type, qty: room.qty })),
        p_guest_name: input.guest.name,
        p_guest_phone: input.guest.phone,
        p_guest_email: input.guest.email,
        ...(input.special_requests ? { p_special_requests: input.special_requests } : {}),
        p_payment_mode: input.payment_mode,
      });
      if (error) throw fromSupabaseError(error);
      return data as unknown as StayBookingRow;
    },

    async getBooking(id) {
      const { data, error } = await supabase.rpc("get_stay_booking", { p_id: id });
      if (error) throw fromSupabaseError(error);
      return (data ?? null) as unknown as StayBookingRow | null;
    },

    async listBookings() {
      const { data, error } = await supabase.rpc("my_stay_bookings");
      if (error) throw fromSupabaseError(error);
      return (data ?? []) as unknown as StayBookingRow[];
    },

    async cancelBooking(id, reason) {
      const { data, error } = await supabase.rpc("cancel_stay", {
        p_booking_id: id,
        ...(reason ? { p_reason: reason } : {}),
      });
      if (error) throw fromSupabaseError(error);
      const result = data as unknown as { booking: StayBookingRow; refund_percent: number };
      if (result.booking.refund_status !== "refund_due") return result;

      // Paid online and cancelled in time: refund through the provider now. A failure leaves the
      // booking refund_due for the team; the cancellation itself has already happened.
      try {
        await refundStayBooking(id);
      } catch (thrown) {
        logger.error("stays.refund_after_cancel_failed", { stay_booking_id: id, error: serializeError(thrown) });
        return result;
      }
      const fresh = await repo.getBooking(id);
      return { booking: fresh ?? result.booking, refund_percent: result.refund_percent };
    },
  };
  return repo;
}

/** The caller's own receipt for a booking (get_stay_invoice: own only, staff included), or null. */
export async function getStayInvoice(supabase: AppSupabaseClient, bookingId: string): Promise<StayInvoice | null> {
  const { data, error } = await supabase.rpc("get_stay_invoice", { p_booking_id: bookingId });
  if (error) throw fromSupabaseError(error);
  if (!data) return null;
  const raw = data as unknown as { invoice_no: string; issued_at: string; booking: StayBookingRow };
  return { invoice_no: raw.invoice_no, issued_at: raw.issued_at, booking: enrichBooking(raw.booking) };
}
