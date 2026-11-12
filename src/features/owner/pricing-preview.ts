import { estimateMonthlyCost, type MonthlyCostEstimate, type PricingCharge, type UtilityBilling } from "@/lib/pricing";

import type { ListingMode } from "./schemas";

/**
 * Live "what a tenant would pay" preview for the owner's pricing form (pure; unit-tested).
 * It feeds lib/pricing.ts — the one pricing function of the product — with what the owner has
 * typed so far. Nothing is guessed: until a rent exists the preview says what is missing.
 */

export type PreviewPricing = {
  monthly_rent: number | null;
  security_deposit: number | null;
  maintenance_monthly: number | null;
  electricity_billing: UtilityBilling | null;
  electricity_monthly_estimate: number | null;
  water_billing: UtilityBilling | null;
  water_monthly_estimate: number | null;
  food_available: boolean;
  food_included: boolean;
  food_monthly_charge: number | null;
};

export type PreviewRoom = { name: string; rent_per_bed: number | null; security_deposit: number | null };

export type PricingPreview =
  | { kind: "estimate"; basis: string; estimate: MonthlyCostEstimate }
  | { kind: "needs"; message: string };

/** Text/number input value -> whole rupees, or null when empty or not a whole non-negative number. */
export function toAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function buildPricingPreview(input: {
  listing_mode: ListingMode;
  pricing: PreviewPricing;
  rooms: readonly PreviewRoom[];
  charges: readonly PricingCharge[];
}): PricingPreview {
  const { pricing } = input;
  if (!pricing.electricity_billing || !pricing.water_billing) {
    return { kind: "needs", message: "Choose how electricity and water are billed to see the estimate." };
  }
  const listing = {
    listing_mode: input.listing_mode,
    monthly_rent: pricing.monthly_rent,
    security_deposit: pricing.security_deposit,
    maintenance_monthly: pricing.maintenance_monthly,
    electricity_billing: pricing.electricity_billing,
    electricity_monthly_estimate: pricing.electricity_billing === "included" ? null : pricing.electricity_monthly_estimate,
    water_billing: pricing.water_billing,
    water_monthly_estimate: pricing.water_billing === "included" ? null : pricing.water_monthly_estimate,
    food_available: pricing.food_available,
    food_included: pricing.food_available && pricing.food_included,
    food_monthly_charge: pricing.food_available && !pricing.food_included ? pricing.food_monthly_charge : null,
    charges: input.charges,
  };

  if (input.listing_mode === "entire_unit") {
    if (pricing.monthly_rent === null) return { kind: "needs", message: "Enter the monthly rent to see the estimate." };
    return { kind: "estimate", basis: "Whole unit", estimate: estimateMonthlyCost(listing) };
  }

  const priced = input.rooms.filter((room): room is PreviewRoom & { rent_per_bed: number } => room.rent_per_bed !== null);
  if (priced.length === 0) {
    return { kind: "needs", message: "Add a room with its rent per bed to see the estimate." };
  }
  const cheapest = priced.reduce((best, room) => (room.rent_per_bed < best.rent_per_bed ? room : best));
  return {
    kind: "estimate",
    basis: `Cheapest bed (${cheapest.name})`,
    estimate: estimateMonthlyCost(listing, {
      room: { rent_per_bed: cheapest.rent_per_bed, security_deposit: cheapest.security_deposit },
    }),
  };
}
