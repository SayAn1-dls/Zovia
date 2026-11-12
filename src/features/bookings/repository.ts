import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

import type { Booking, BookingStatus, RequestBookingInput } from "./schemas";

/**
 * Bookings through the caller's own session. RLS lets only the seeker, the owner and staff read a
 * booking; every change goes through a SECURITY DEFINER function that re-checks who is asking.
 */

const BOOKING_COLUMNS = `id, status, move_in_date, stay_months, note, amount_inr, amount_kind, monthly_rent_inr,
  respond_by, pay_by, decline_reason, cancel_reason, confirmed_at, created_at, seeker_id,
  properties!inner(id, slug, title, locality, city, cover_media_path),
  rooms(name), beds(label), payments(status)`;

type Row = {
  id: string;
  status: BookingStatus;
  move_in_date: string;
  stay_months: number;
  note: string | null;
  amount_inr: number;
  amount_kind: Booking["amount_kind"];
  monthly_rent_inr: number;
  respond_by: string;
  pay_by: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  seeker_id: string;
  properties: Booking["property"];
  rooms: { name: string } | null;
  beds: { label: string } | null;
  payments: { status: string }[];
};

function toBooking(row: Row, seekerNames: Map<string, string>): Booking {
  return {
    id: row.id,
    status: row.status,
    move_in_date: row.move_in_date,
    stay_months: row.stay_months,
    note: row.note,
    amount_inr: row.amount_inr,
    amount_kind: row.amount_kind,
    monthly_rent_inr: row.monthly_rent_inr,
    respond_by: row.respond_by,
    pay_by: row.pay_by,
    decline_reason: row.decline_reason,
    cancel_reason: row.cancel_reason,
    confirmed_at: row.confirmed_at,
    created_at: row.created_at,
    property: row.properties,
    room_name: row.rooms?.name ?? null,
    bed_label: row.beds?.label ?? null,
    seeker_id: row.seeker_id,
    seeker_name: seekerNames.get(row.seeker_id) ?? null,
    paid: row.payments.some((payment) => payment.status === "paid"),
  };
}

async function seekerNames(supabase: AppSupabaseClient, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("public_user_cards").select("user_id, display_name").in("user_id", ids);
  if (error) throw fromSupabaseError(error);
  return new Map((data ?? []).flatMap((card) => (card.user_id && card.display_name ? [[card.user_id, card.display_name]] : [])));
}

async function hydrate(supabase: AppSupabaseClient, rows: Row[]): Promise<Booking[]> {
  const names = await seekerNames(supabase, [...new Set(rows.map((row) => row.seeker_id))]);
  return rows.map((row) => toBooking(row, names));
}

export async function listBookings(
  supabase: AppSupabaseClient,
  filter: { seekerId?: string; ownerId?: string },
): Promise<Booking[]> {
  let query = supabase.from("bookings").select(BOOKING_COLUMNS).order("created_at", { ascending: false }).limit(100);
  if (filter.seekerId) query = query.eq("seeker_id", filter.seekerId);
  if (filter.ownerId) query = query.eq("owner_id", filter.ownerId);
  const { data, error } = await query;
  if (error) throw fromSupabaseError(error);
  return hydrate(supabase, (data ?? []) as unknown as Row[]);
}

export async function getBooking(supabase: AppSupabaseClient, id: string): Promise<Booking | null> {
  const { data, error } = await supabase.from("bookings").select(BOOKING_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw fromSupabaseError(error);
  if (!data) return null;
  const [booking] = await hydrate(supabase, [data as unknown as Row]);
  return booking ?? null;
}

export async function requestBooking(supabase: AppSupabaseClient, input: RequestBookingInput): Promise<string> {
  const { data, error } = await supabase.rpc("request_booking", {
    p_property_id: input.property_id,
    p_move_in_date: input.move_in_date,
    p_stay_months: input.stay_months,
    ...(input.bed_id ? { p_bed_id: input.bed_id } : {}),
    ...(input.note ? { p_note: input.note } : {}),
  });
  if (error) throw fromSupabaseError(error);
  return data as string;
}

export async function respondBooking(supabase: AppSupabaseClient, id: string, accept: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("owner_respond_booking", {
    p_booking_id: id,
    p_accept: accept,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) throw fromSupabaseError(error);
}

export async function cancelBooking(supabase: AppSupabaseClient, id: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: id, ...(reason ? { p_reason: reason } : {}) });
  if (error) throw fromSupabaseError(error);
}

/** Checks (as the seeker) that the booking is payable and returns the amount in paise. */
export async function payableAmountPaise(supabase: AppSupabaseClient, id: string): Promise<number> {
  const { data, error } = await supabase.rpc("booking_payable_amount", { p_booking_id: id });
  if (error) throw fromSupabaseError(error);
  return Number(data);
}
