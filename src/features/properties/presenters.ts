import { formatDate, formatNumber } from "@/lib/format";
import {
  estimateMonthlyCost,
  PricingInputError,
  type MonthlyCostEstimate,
  type PricingListing,
  type UtilityBilling,
} from "@/lib/pricing";

import { LISTING_FRESH_DAYS, type ListingMode, type PropertyDetail, type PropertyRoom } from "./schemas";

/** Pure presentation rules for listings (isomorphic, unit-tested). */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Public URL of an object in the public `property-media` bucket (spec 6.8). */
export function propertyMediaUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/property-media/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** Trust signal "Listing recently confirmed": confirmed within `days` before `now`. */
export function isRecentlyConfirmed(
  lastConfirmedAt: string | null | undefined,
  now: number,
  days: number = LISTING_FRESH_DAYS,
): boolean {
  if (!lastConfirmedAt) return false;
  const at = Date.parse(lastConfirmedAt);
  if (!Number.isFinite(at)) return false;
  return at <= now + 60_000 && now - at <= days * DAY_MS;
}

/** Trust signal "Property authorisation verified": a verified, unexpired `authorisation` row. */
export function isAuthorisationVerified(
  row: { status: string; expires_at: string | null } | null | undefined,
  now: number,
): boolean {
  if (!row || row.status !== "verified") return false;
  if (!row.expires_at) return true;
  const expires = Date.parse(row.expires_at);
  return Number.isFinite(expires) && expires > now;
}

/**
 * Bed availability, always as counts and never merged with the property's availability
 * statement: "3 of 8 beds available".
 */
export function bedAvailabilityLabel(available: number, total: number): string {
  if (total <= 0) return "No beds listed yet";
  if (available <= 0) return total === 1 ? "The only bed is taken" : `All ${formatNumber(total)} beds taken`;
  return `${formatNumber(available)} of ${formatNumber(total)} ${total === 1 ? "bed" : "beds"} available`;
}

/** "from" for per-bed listings (the cheapest bed), nothing for an entire unit's single rent. */
export function pricePrefix(mode: ListingMode): "from" | null {
  return mode === "per_bed" ? "from" : null;
}

/** "Available from 1 Dec 2026" / "Available now" for an entire-unit availability row. */
export function availableFromLabel(availableFrom: string | null | undefined, today: string): string | null {
  if (!availableFrom) return null;
  return availableFrom <= today ? "Available now" : `Available from ${formatDate(availableFrom)}`;
}

/** Rooms a per-bed price estimate can be computed for (they have a rent). Cheapest first. */
export function pricedRooms(rooms: readonly PropertyRoom[]): PropertyRoom[] {
  return rooms
    .filter((room) => room.rent_per_bed !== null)
    .sort((a, b) => (a.rent_per_bed ?? 0) - (b.rent_per_bed ?? 0) || a.name.localeCompare(b.name));
}

type PricingSource = Pick<
  PropertyDetail,
  | "listing_mode"
  | "monthly_rent"
  | "security_deposit"
  | "maintenance_monthly"
  | "electricity_billing"
  | "electricity_monthly_estimate"
  | "water_billing"
  | "water_monthly_estimate"
  | "food_available"
  | "food_included"
  | "food_monthly_charge"
  | "charges"
  | "rooms"
>;

export type CostEstimateView =
  | { ok: true; estimate: MonthlyCostEstimate }
  | { ok: false; reason: "no_rent" };

/**
 * Monthly + move-in cost via `lib/pricing.ts`. Utilities whose billing the owner has not stated
 * are passed as "fixed, amount unknown" (so they are left out of the total and the total is
 * flagged incomplete), then relabelled honestly as "billing not stated" — we never claim a bill
 * is included, fixed or metered when the owner did not say so.
 */
export function buildCostEstimate(listing: PricingSource, roomId?: string | null): CostEstimateView {
  const unknownBilling: Record<"electricity" | "water", boolean> = {
    electricity: listing.electricity_billing === null,
    water: listing.water_billing === null,
  };
  const input: PricingListing = {
    listing_mode: listing.listing_mode,
    monthly_rent: listing.monthly_rent,
    security_deposit: listing.security_deposit,
    maintenance_monthly: listing.maintenance_monthly,
    electricity_billing: (listing.electricity_billing ?? "fixed") as UtilityBilling,
    electricity_monthly_estimate: unknownBilling.electricity ? null : listing.electricity_monthly_estimate,
    water_billing: (listing.water_billing ?? "fixed") as UtilityBilling,
    water_monthly_estimate: unknownBilling.water ? null : listing.water_monthly_estimate,
    food_available: listing.food_available,
    food_included: listing.food_included,
    food_monthly_charge: listing.food_monthly_charge,
    charges: listing.charges,
  };

  let estimate: MonthlyCostEstimate;
  try {
    if (listing.listing_mode === "per_bed") {
      const rooms = pricedRooms(listing.rooms);
      const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
      if (!room || room.rent_per_bed === null) return { ok: false, reason: "no_rent" };
      estimate = estimateMonthlyCost(input, {
        room: { rent_per_bed: room.rent_per_bed, security_deposit: room.security_deposit },
      });
    } else {
      if (listing.monthly_rent === null) return { ok: false, reason: "no_rent" };
      estimate = estimateMonthlyCost(input);
    }
  } catch (error) {
    if (error instanceof PricingInputError) return { ok: false, reason: "no_rent" };
    throw error;
  }

  for (const kind of ["electricity", "water"] as const) {
    if (!unknownBilling[kind]) continue;
    const name = kind === "electricity" ? "Electricity" : "Water";
    for (const item of estimate.items) {
      if (item.kind === kind) item.label = `${name} (billing not stated by the owner)`;
    }
    estimate.notes = estimate.notes.map((note) =>
      note.startsWith(`${name} is a fixed monthly charge the owner has not specified`)
        ? `The owner has not said how ${kind} is billed; it is not part of this total.`
        : note,
    );
  }
  return { ok: true, estimate };
}
