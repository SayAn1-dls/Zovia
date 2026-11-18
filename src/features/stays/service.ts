import { getCatalogListing, similarCatalogListings, type CatalogListing } from "@/features/catalog/listings";
import { errors } from "@/server/http/errors";
import { logger } from "@/server/logger";

import { type StayEvent } from "./notifications";
import { priceStay } from "./pricing";
import type { StayBookingRow, StayPaymentPort, StayRepository } from "./ports";
import { addDays, indiaToday } from "./hooks/stay-dates";
import {
  isCalendarDate,
  nightsBetween,
  STAY_RULES,
  STAY_ROOM_LABELS,
  type CancelStayResult,
  type CreateStayBookingInput,
  type CreateStayBookingResult,
  type StayAlternative,
  type StayAvailability,
  type StayBooking,
  type StayPolicy,
  type StayQuote,
  type StayRequest,
} from "./schemas";

/** Stay booking rules. Everything is injected so it is unit-testable with in-memory fakes. */

export type StayDeps = {
  repo: StayRepository;
  payments: StayPaymentPort;
  /** Current time; India-time "today" is derived from it. */
  now: () => Date;
  /** Best-effort notifications; defaults to none. Failures never reach the caller. */
  notify?: (event: StayEvent, booking: StayBooking) => Promise<unknown>;
  /** Catalogue lookup; defaults to getCatalogListing. */
  getListing?: (slug: string) => CatalogListing | null;
  /** Similar listings, nearest first; defaults to the same city by distance. */
  similar?: (listing: CatalogListing) => CatalogListing[];
};

const MAX_ALTERNATIVES = 3;

/** Nearby places in the same city that still have beds (for a sold-out card). */
function alternativesFor(deps: StayDeps, listing: CatalogListing): StayAlternative[] {
  const similar = deps.similar ?? ((from: CatalogListing) => similarCatalogListings(from, 100));
  return similar(listing)
    .filter((other) => other.slug !== listing.slug && other.available_beds > 0)
    .slice(0, MAX_ALTERNATIVES)
    .map((other) => ({
      slug: other.slug,
      title: other.title,
      locality: other.locality,
      unit_price_from_inr: Math.ceil(other.price_from / STAY_RULES.days_per_month),
    }));
}

/** Throws a validation error unless the dates follow the stay rules. Returns the night count. */
export function assertStayDates(checkin: string, checkout: string, now: Date): number {
  const fail = (field: "checkin" | "checkout", message: string) =>
    errors.validation({ formErrors: [], fieldErrors: { [field]: [message] } });
  if (!isCalendarDate(checkin)) throw fail("checkin", "Choose a valid check-in date.");
  if (!isCalendarDate(checkout)) throw fail("checkout", "Choose a valid check-out date.");
  const today = indiaToday(now.getTime());
  if (checkin < today) throw fail("checkin", "Check-in cannot be in the past.");
  if (checkin > addDays(today, STAY_RULES.max_days_ahead)) {
    throw fail("checkin", `You can book up to ${STAY_RULES.max_days_ahead} days ahead.`);
  }
  const nights = nightsBetween(checkin, checkout);
  if (nights < STAY_RULES.min_nights) throw fail("checkout", "Check-out must be after check-in.");
  if (nights > STAY_RULES.max_nights) throw fail("checkout", `At most ${STAY_RULES.max_nights} nights.`);
  return nights;
}

function requireListing(deps: StayDeps, slug: string): CatalogListing {
  const listing = (deps.getListing ?? getCatalogListing)(slug);
  if (!listing) throw errors.notFound("We could not find that stay.");
  return listing;
}

function stayPolicy(): StayPolicy {
  return {
    free_cancel_days: STAY_RULES.free_cancel_days,
    check_in_time: STAY_RULES.check_in_time,
    check_out_time: STAY_RULES.check_out_time,
    lines: [
      `Cancel at least ${STAY_RULES.free_cancel_days} days before check-in for a full refund.`,
      `Inside ${STAY_RULES.free_cancel_days} days of check-in there is no refund, and dates cannot be changed.`,
      `Check-in is from ${STAY_RULES.check_in_time}. Check-out is by ${STAY_RULES.check_out_time}.`,
      "Guests must be 18 or older and carry a valid photo ID at check-in.",
      `Up to ${STAY_RULES.max_units} beds in one booking.`,
    ],
  };
}

export async function availability(
  deps: StayDeps,
  listing: string,
  checkin: string,
  checkout: string,
): Promise<StayAvailability> {
  const found = requireListing(deps, listing);
  const nights = assertStayDates(checkin, checkout, deps.now());
  const raw = await deps.repo.availability(listing, checkin, checkout);
  const soldOut = raw.some((room) => room.units_left === 0);
  return {
    listing,
    checkin,
    checkout,
    nights,
    ...(soldOut ? { alternatives: alternativesFor(deps, found) } : {}),
    rooms: raw.map((room) => ({
      room_type: room.room_type,
      label: STAY_ROOM_LABELS[room.room_type],
      rent_per_month_inr: room.rent_per_month_inr,
      unit_price_inr: Math.ceil(room.rent_per_month_inr / STAY_RULES.days_per_month),
      units_total: room.units_total,
      units_left: room.units_left,
      sold_out: room.units_left === 0,
      ac: room.ac,
      attached_bathroom: room.attached_bathroom,
      strip: room.strip,
    })),
  };
}

/** Prices come only from the repository's rent. */
export async function quote(deps: StayDeps, request: StayRequest): Promise<StayQuote> {
  requireListing(deps, request.listing);
  const nights = assertStayDates(request.checkin, request.checkout, deps.now());
  const raw = await deps.repo.availability(request.listing, request.checkin, request.checkout);
  const byType = new Map(raw.map((room) => [room.room_type, room]));

  const shortfalls: StayQuote["shortfalls"] = [];
  const priced = request.rooms.map((selection) => {
    const room = byType.get(selection.room_type);
    if (!room) {
      throw errors.badRequest(`${STAY_ROOM_LABELS[selection.room_type]} is not offered at this stay.`);
    }
    if (room.units_left < selection.qty) {
      shortfalls.push({ room_type: selection.room_type, requested: selection.qty, available: room.units_left });
    }
    return { room_type: selection.room_type, units: selection.qty, rent_per_month_inr: room.rent_per_month_inr };
  });

  const price = priceStay({ nights, rooms: priced });
  return {
    listing: request.listing,
    checkin: request.checkin,
    checkout: request.checkout,
    nights,
    guests: priced.reduce((sum, room) => sum + room.units, 0),
    ...price,
    available: shortfalls.length === 0,
    shortfalls,
    policy: stayPolicy(),
  };
}

function withListing(deps: StayDeps, row: StayBookingRow): StayBooking {
  const listing = (deps.getListing ?? getCatalogListing)(row.listing);
  return {
    ...row,
    listing_title: listing?.title ?? row.listing,
    city: listing?.city ?? "",
    locality: listing?.locality ?? "",
  };
}

async function notifySafely(deps: StayDeps, event: StayEvent, booking: StayBooking): Promise<void> {
  if (!deps.notify) return;
  try {
    await deps.notify(event, booking);
  } catch (error) {
    logger.warn("stays.notify_failed", { booking_id: booking.id, event, error: error instanceof Error ? error.name : "unknown" });
  }
}

function soldOutMessage(shortfall: StayQuote["shortfalls"][number]): string {
  const label = STAY_ROOM_LABELS[shortfall.room_type];
  return shortfall.available === 0
    ? `${label} is sold out for these dates.`
    : `Only ${shortfall.available} ${label.toLowerCase()} bed${shortfall.available === 1 ? "" : "s"} left for these dates.`;
}

export async function createBooking(deps: StayDeps, input: CreateStayBookingInput): Promise<CreateStayBookingResult> {
  const current = await quote(deps, input.stay);
  const first = current.shortfalls[0];
  if (first) {
    throw errors.conflict(soldOutMessage(first), { details: { shortfalls: current.shortfalls } });
  }
  if (input.expected_total_inr !== undefined && input.expected_total_inr !== current.grand_total_inr) {
    throw errors.conflict("The price changed. Review and confirm again.", {
      details: { expected_total_inr: input.expected_total_inr, grand_total_inr: current.grand_total_inr },
    });
  }

  const row = await deps.repo.createBooking({
    listing: input.stay.listing,
    checkin: input.stay.checkin,
    checkout: input.stay.checkout,
    rooms: input.stay.rooms,
    guest: input.guest,
    special_requests: input.special_requests?.trim() ? input.special_requests.trim() : null,
    payment_mode: deps.payments.configured() ? "online" : "at_property",
  });
  const booking = withListing(deps, row);
  const payment = await deps.payments.instructionFor(row);
  // Online holds are announced by the payment side once they are paid; only a booking that is
  // already confirmed (pay at the property) is announced here.
  if (row.payment_mode === "at_property") await notifySafely(deps, "created", booking);
  return { booking, payment };
}

/**
 * Payment instruction for the caller's own unpaid booking, so a guest who closed Razorpay can pay
 * again (the open order is re-used). Only while the booking is `pending_payment` and the hold lives.
 */
export async function payInstruction(deps: StayDeps, id: string): Promise<CreateStayBookingResult> {
  const row = await deps.repo.getBooking(id);
  if (!row) throw errors.notFound("Booking not found.");
  if (row.status !== "pending_payment") throw errors.conflict("This booking is not waiting for payment.");
  if (row.hold_expires_at && Date.parse(row.hold_expires_at) <= deps.now().getTime()) {
    throw errors.conflict("The hold on your beds has ended. Book again from the listing.");
  }
  const payment = await deps.payments.instructionFor(row);
  return { booking: withListing(deps, row), payment };
}

export async function getBooking(deps: StayDeps, id: string): Promise<StayBooking> {
  const row = await deps.repo.getBooking(id);
  if (!row) throw errors.notFound("Booking not found.");
  return withListing(deps, row);
}

export async function listBookings(deps: StayDeps): Promise<StayBooking[]> {
  return (await deps.repo.listBookings()).map((row) => withListing(deps, row));
}

export async function cancel(deps: StayDeps, id: string, reason?: string | null): Promise<CancelStayResult> {
  await getBooking(deps, id); // own booking or 404
  const result = await deps.repo.cancelBooking(id, reason?.trim() ? reason.trim() : null);
  const booking = withListing(deps, result.booking);
  await notifySafely(deps, "cancelled", booking);
  return { booking, refund_percent: result.refund_percent };
}

/** Checks the booking is the caller's, verifies the checkout signature, returns the fresh booking. */
export async function verifyPayment(
  deps: StayDeps,
  id: string,
  proof: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
): Promise<StayBooking> {
  await getBooking(deps, id);
  const { booking_id } = await deps.payments.verifyCheckout(proof);
  if (booking_id !== id) throw errors.badRequest("That payment belongs to a different booking.");
  return getBooking(deps, id);
}
