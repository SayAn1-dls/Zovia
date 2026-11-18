import { z } from "zod";

/**
 * Stay booking contracts (isomorphic): the shapes shared by the database functions, the API and the
 * screens. See docs/stay-booking.md. Field names are database columns (snake_case). Money is integer INR.
 */

export const STAY_ROOM_TYPES = ["single", "double", "triple"] as const;
export type StayRoomType = (typeof STAY_ROOM_TYPES)[number];

export const STAY_ROOM_LABELS: Record<StayRoomType, string> = {
  single: "Single room",
  double: "Double sharing",
  triple: "Triple sharing",
};

/** Rules that the database and the quote code must agree on. Change them here and in the SQL together. */
export const STAY_RULES = {
  /** Most beds (units) in one booking, summed over room types. */
  max_units: 8,
  min_nights: 1,
  max_nights: 30,
  max_days_ahead: 365,
  /** Minutes an online payment hold keeps the beds. */
  hold_minutes: 15,
  /** Cancelling at least this many days before check-in refunds in full; later refunds nothing. */
  free_cancel_days: 7,
  check_in_time: "13:00",
  check_out_time: "10:00",
  /** Nightly price per unit = ceil(rent per month / this). */
  days_per_month: 30,
  /** Tax percent on the stay total: low when the nightly unit price is at most the threshold, else high. */
  tax_percent_low: 5,
  tax_percent_high: 18,
  tax_threshold_unit_night_inr: 7500,
} as const;

export const STAY_BOOKING_STATUSES = ["pending_payment", "confirmed", "cancelled", "expired", "completed"] as const;
export type StayBookingStatus = (typeof STAY_BOOKING_STATUSES)[number];

export const STAY_STATUS_LABELS: Record<StayBookingStatus, string> = {
  pending_payment: "Waiting for payment",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  expired: "Expired",
  completed: "Completed",
};

/** A real calendar day: "2027-02-30" is rejected here, not rolled over to 2 March by Date.parse. */
export function isCalendarDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.")
  .refine(isCalendarDate, "Choose a real date.");

/** Whole nights between two YYYY-MM-DD dates (check-out minus check-in); NaN-safe: returns 0 when invalid. */
export function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

export const roomSelectionSchema = z.object({
  room_type: z.enum(STAY_ROOM_TYPES),
  qty: z.coerce.number().int().min(1, "Choose at least 1.").max(STAY_RULES.max_units, `At most ${STAY_RULES.max_units} beds.`),
});
export type RoomSelection = z.output<typeof roomSelectionSchema>;

/** The stay itself: which listing, which nights, which rooms. Used by the quote and by booking. */
export const stayRequestSchema = z
  .object({
    /** Catalogue slug (the part after `catalog:`). */
    listing: z.string().trim().min(1).max(200),
    checkin: isoDate,
    checkout: isoDate,
    rooms: z.array(roomSelectionSchema).min(1, "Choose a bed.").max(STAY_ROOM_TYPES.length),
  })
  .superRefine((value, ctx) => {
    // A bad date already has its own message; don't add a misleading "check-out" one on top.
    const datesValid = isCalendarDate(value.checkin) && isCalendarDate(value.checkout);
    const nights = nightsBetween(value.checkin, value.checkout);
    if (!datesValid) {
      // nothing more to say about the range
    } else if (nights < STAY_RULES.min_nights) {
      ctx.addIssue({ code: "custom", path: ["checkout"], message: "Check-out must be after check-in." });
    } else if (nights > STAY_RULES.max_nights) {
      ctx.addIssue({ code: "custom", path: ["checkout"], message: `At most ${STAY_RULES.max_nights} nights.` });
    }
    const types = value.rooms.map((room) => room.room_type);
    if (new Set(types).size !== types.length) {
      ctx.addIssue({ code: "custom", path: ["rooms"], message: "Each room type once." });
    }
    const units = value.rooms.reduce((sum, room) => sum + room.qty, 0);
    if (units > STAY_RULES.max_units) {
      ctx.addIssue({ code: "custom", path: ["rooms"], message: `At most ${STAY_RULES.max_units} beds in one booking.` });
    }
  });
export type StayRequest = z.output<typeof stayRequestSchema>;

export const availabilityQuerySchema = z.object({
  listing: z.string().trim().min(1).max(200),
  checkin: isoDate,
  checkout: isoDate,
});

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your e-mail.")
  .max(254)
  .pipe(z.email("Enter a valid e-mail, like name@example.com."));

/**
 * Indian mobile number as people write it ("98765 43210", "+91 98765 43210", "09876543210",
 * "91-98765-43210") to the 10 digits the database stores. Anything else is returned unchanged, so
 * the 10-digit check below rejects it.
 */
export function normalisePhone(raw: string): string {
  const text = raw.trim();
  if (!/^[\d\s+\-().]+$/.test(text)) return text;
  const digits = text.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/** True when the text has no control characters (tabs and line breaks count as control characters). */
const noControlChars = (value: string) => !/\p{Cc}/u.test(value);

export const stayGuestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your name.")
    .max(80, "Keep your name under 80 characters.")
    .refine(noControlChars, "Use letters and spaces only in your name."),
  phone: z
    .string()
    .max(24, "Enter a 10-digit mobile number.")
    .transform(normalisePhone)
    .pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number.")),
  email: emailField,
});
export type StayGuest = z.output<typeof stayGuestSchema>;

/** POST /api/v1/stays/bookings */
export const createStayBookingSchema = z.object({
  stay: stayRequestSchema,
  guest: stayGuestSchema,
  /** Free text: carriage returns are dropped, new lines kept, other control characters refused. */
  special_requests: z
    .string()
    .transform((value) => value.replace(/\r/g, "").trim())
    .pipe(
      z
        .string()
        .max(500, "Keep it under 500 characters.")
        .refine((value) => !/[^\P{Cc}\n]/u.test(value), "Remove special characters from your request."),
    )
    .optional(),
  /** The total the guest saw. When it differs from today's price the booking is refused (409). */
  expected_total_inr: z.number().int().min(0).max(10_000_000).optional(),
  /** The guest ticked "I accept the cancellation and house policies". */
  accept_policy: z.literal(true, { error: "Please accept the policies to continue." }),
});
export type CreateStayBookingInput = z.output<typeof createStayBookingSchema>;

export const cancelStaySchema = z.object({ reason: z.string().trim().max(300).optional() });

/* ───────────── responses ───────────── */

export type StayPolicy = {
  free_cancel_days: number;
  check_in_time: string;
  check_out_time: string;
  /** Plain sentences for the policy box, in display order. */
  lines: string[];
};

export type StayNight = { date: string; units_left: number };

export type StayRoomAvailability = {
  room_type: StayRoomType;
  label: string;
  /** Rent per month from the listing; the nightly price is derived from it. */
  rent_per_month_inr: number;
  unit_price_inr: number;
  units_total: number;
  /** Fewest units free on any night of the requested range. */
  units_left: number;
  sold_out: boolean;
  ac: boolean;
  attached_bathroom: boolean;
  /** Seven nights starting at check-in: free units per night (for the sold-out calendar). */
  strip: StayNight[];
};

/** A similar place in the same city that has beds, offered when a room type is sold out. */
export type StayAlternative = { slug: string; title: string; locality: string; unit_price_from_inr: number };

/** GET /api/v1/stays/availability */
export type StayAvailability = {
  listing: string;
  checkin: string;
  checkout: string;
  nights: number;
  rooms: StayRoomAvailability[];
  /** Up to 3 similar places nearby with beds; present only when something here is sold out. */
  alternatives?: StayAlternative[];
};

export type StayQuoteLine = {
  room_type: StayRoomType;
  label: string;
  units: number;
  unit_price_inr: number;
  nights: number;
  line_total_inr: number;
};

/** POST /api/v1/stays/quote: priced on the server, never from client prices. */
export type StayQuote = {
  listing: string;
  checkin: string;
  checkout: string;
  nights: number;
  guests: number;
  lines: StayQuoteLine[];
  stay_total_inr: number;
  tax_percent: number;
  tax_inr: number;
  grand_total_inr: number;
  payable_now_inr: number;
  /** False when some requested type has fewer free units than requested for these nights. */
  available: boolean;
  shortfalls: { room_type: StayRoomType; requested: number; available: number }[];
  policy: StayPolicy;
};

export type RefundStatus = "none" | "pending" | "refunded" | "refund_due";

export type StayBooking = {
  id: string;
  status: StayBookingStatus;
  payment_mode: "online" | "at_property";
  paid: boolean;
  listing: string;
  listing_title: string;
  city: string;
  locality: string;
  checkin: string;
  checkout: string;
  nights: number;
  guests: number;
  lines: StayQuoteLine[];
  stay_total_inr: number;
  tax_percent: number;
  tax_inr: number;
  grand_total_inr: number;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  special_requests: string | null;
  hold_expires_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  refund_inr: number;
  refund_status: RefundStatus;
  /** Last moment a cancellation is still fully refunded (ISO timestamp), or null once passed. */
  free_cancel_until: string | null;
  created_at: string;
};

export type StayPayment =
  | { mode: "online"; provider: "razorpay"; key_id: string; order_id: string; amount_paise: number; currency: "INR"; description: string }
  | { mode: "at_property" };

/** POST /api/v1/stays/bookings */
export type CreateStayBookingResult = { booking: StayBooking; payment: StayPayment };

/** POST /api/v1/stays/bookings/[id]/cancel */
export type CancelStayResult = { booking: StayBooking; refund_percent: number };
