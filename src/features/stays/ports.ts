import type {
  CancelStayResult,
  RoomSelection,
  StayBooking,
  StayGuest,
  StayNight,
  StayPayment,
  StayRoomType,
} from "./schemas";

/**
 * The seam between the stay service (pricing, rules, notifications: `service.ts`) and the data layer
 * (database calls and payment provider: `repository.ts`, `payment.ts`). The service only talks to these
 * interfaces, so it is unit-tested with in-memory fakes and the data layer is tested against Postgres.
 * See docs/stay-booking.md.
 */

/** One room type as the database reports it for a listing and a range of nights. */
export type RawRoomAvailability = {
  room_type: StayRoomType;
  units_total: number;
  rent_per_month_inr: number;
  /** Fewest units free on any night of the range. */
  units_left: number;
  ac: boolean;
  attached_bathroom: boolean;
  /** Seven nights starting at check-in: free units per night. */
  strip: StayNight[];
};

/** A booking as stored. `listing_title`, `city` and `locality` come from the catalogue, added by the service. */
export type StayBookingRow = Omit<StayBooking, "listing_title" | "city" | "locality">;

export interface StayRepository {
  /** `stay_availability()` in the database. Public. Unknown listing: empty array. */
  availability(listing: string, checkin: string, checkout: string): Promise<RawRoomAvailability[]>;

  /**
   * `book_stay()`: atomic. Recomputes prices and per-night availability in SQL, so it never trusts the
   * caller's prices. `payment_mode` "online" holds the beds as `pending_payment` for STAY_RULES.hold_minutes;
   * "at_property" confirms at once. Throws AppError conflict (ZV409) when a night is sold out.
   */
  createBooking(input: {
    listing: string;
    checkin: string;
    checkout: string;
    rooms: RoomSelection[];
    guest: StayGuest;
    special_requests: string | null;
    payment_mode: "online" | "at_property";
  }): Promise<StayBookingRow>;

  /** The signed-in user's own booking (RLS), or null. */
  getBooking(id: string): Promise<StayBookingRow | null>;
  /** The signed-in user's bookings, newest first. */
  listBookings(): Promise<StayBookingRow[]>;
  /** `cancel_stay()`: applies the refund policy in SQL and frees the beds. */
  cancelBooking(id: string, reason: string | null): Promise<{ booking: StayBookingRow; refund_percent: number }>;
}

export interface StayPaymentPort {
  /** True when an online provider is configured (Razorpay keys present). */
  configured(): boolean;
  /**
   * Payment instruction for a freshly created booking: an online order for a `pending_payment` booking
   * (re-using an open order if one exists), or `{ mode: "at_property" }`.
   */
  instructionFor(booking: StayBookingRow): Promise<StayPayment>;
  /** Verifies the checkout signature and confirms the booking. Idempotent. */
  verifyCheckout(input: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): Promise<{ booking_id: string }>;
}

export type { CancelStayResult };
