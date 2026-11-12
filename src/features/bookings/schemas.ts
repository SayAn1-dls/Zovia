import { z } from "zod";

/** Booking contracts (isomorphic). Field names are database columns. Money: integer INR. */

export const BOOKING_STATUSES = ["requested", "accepted", "confirmed", "declined", "expired", "cancelled"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  requested: "Waiting for owner",
  accepted: "Accepted: pay to confirm",
  confirmed: "Confirmed",
  declined: "Declined",
  expired: "Expired",
  cancelled: "Cancelled",
};

export const AMOUNT_KIND_LABELS = {
  security_deposit: "Security deposit",
  first_month_rent: "First month's rent",
} as const;
export type AmountKind = keyof typeof AMOUNT_KIND_LABELS;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

export const requestBookingSchema = z.object({
  property_id: z.uuid(),
  bed_id: z.uuid().optional(),
  move_in_date: isoDate,
  stay_months: z.coerce.number().int().min(1, "At least 1 month.").max(36, "At most 36 months."),
  note: z.string().trim().max(500, "Keep it under 500 characters.").optional(),
});
export type RequestBookingInput = z.output<typeof requestBookingSchema>;
export type RequestBookingFormValues = z.input<typeof requestBookingSchema>;

export const respondBookingSchema = z
  .object({ accept: z.boolean(), reason: z.string().trim().max(300).optional() })
  .refine((value) => value.accept || (value.reason?.length ?? 0) >= 3, {
    path: ["reason"],
    message: "Tell the seeker why (a few words is enough).",
  });
export type RespondBookingInput = z.output<typeof respondBookingSchema>;

export const cancelBookingSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const demoPaymentSchema = z.object({ booking_id: z.uuid() });

export const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1).max(100),
  razorpay_payment_id: z.string().min(1).max(100),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/i),
});
export type VerifyPaymentInput = z.output<typeof verifyPaymentSchema>;

/** A booking as either party sees it. */
export type Booking = {
  id: string;
  status: BookingStatus;
  move_in_date: string;
  stay_months: number;
  note: string | null;
  amount_inr: number;
  amount_kind: AmountKind;
  monthly_rent_inr: number;
  respond_by: string;
  pay_by: string | null;
  decline_reason: string | null;
  cancel_reason: string | null;
  confirmed_at: string | null;
  created_at: string;
  property: { id: string; slug: string; title: string; locality: string | null; city: string | null; cover_media_path: string | null };
  room_name: string | null;
  bed_label: string | null;
  seeker_id: string;
  seeker_name: string | null;
  paid: boolean;
};

/** POST /api/v1/bookings/[id]/payment-order: what the browser needs to open Razorpay Checkout. */
export type PaymentOrder =
  | { status: "ready"; provider: "razorpay"; key_id: string; order_id: string; amount_paise: number; currency: "INR"; description: string }
  | { status: "demo" }
  | { status: "not_configured" };

/** Calendar date `days` from today in India, as YYYY-MM-DD. */
export function indiaDate(days = 0): string {
  const now = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
}
