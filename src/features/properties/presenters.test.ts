import { describe, expect, it } from "vitest";

import {
  availableFromLabel,
  bedAvailabilityLabel,
  buildCostEstimate,
  isAuthorisationVerified,
  isRecentlyConfirmed,
  pricedRooms,
  propertyMediaUrl,
} from "./presenters";
import type { PropertyRoom } from "./schemas";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-12T10:00:00Z");

describe("isRecentlyConfirmed", () => {
  it("is true within the window and false outside it", () => {
    expect(isRecentlyConfirmed(new Date(NOW - 29 * DAY).toISOString(), NOW)).toBe(true);
    expect(isRecentlyConfirmed(new Date(NOW - 31 * DAY).toISOString(), NOW)).toBe(false);
    expect(isRecentlyConfirmed(null, NOW)).toBe(false);
    expect(isRecentlyConfirmed("garbage", NOW)).toBe(false);
  });

  it("does not trust a confirmation dated in the future", () => {
    expect(isRecentlyConfirmed(new Date(NOW + DAY).toISOString(), NOW)).toBe(false);
  });
});

describe("isAuthorisationVerified", () => {
  it("needs a verified, unexpired row", () => {
    expect(isAuthorisationVerified({ status: "verified", expires_at: null }, NOW)).toBe(true);
    expect(isAuthorisationVerified({ status: "verified", expires_at: new Date(NOW + DAY).toISOString() }, NOW)).toBe(true);
    expect(isAuthorisationVerified({ status: "verified", expires_at: new Date(NOW - DAY).toISOString() }, NOW)).toBe(false);
    expect(isAuthorisationVerified({ status: "pending", expires_at: null }, NOW)).toBe(false);
    expect(isAuthorisationVerified(null, NOW)).toBe(false);
  });
});

describe("bedAvailabilityLabel", () => {
  it("states bed counts", () => {
    expect(bedAvailabilityLabel(3, 8)).toBe("3 of 8 beds available");
    expect(bedAvailabilityLabel(1, 1)).toBe("1 of 1 bed available");
    expect(bedAvailabilityLabel(0, 8)).toBe("All 8 beds taken");
    expect(bedAvailabilityLabel(0, 0)).toBe("No beds listed yet");
  });
});

describe("availableFromLabel", () => {
  it("compares with the given India date", () => {
    expect(availableFromLabel("2026-11-01", "2026-11-12")).toBe("Available now");
    expect(availableFromLabel("2026-12-01", "2026-11-12")).toBe("Available from 1 Dec 2026");
    expect(availableFromLabel(null, "2026-11-12")).toBeNull();
  });
});

describe("propertyMediaUrl", () => {
  it("builds the public bucket URL and encodes path segments", () => {
    expect(propertyMediaUrl("http://127.0.0.1:54321/", "abc/photo 1.webp")).toBe(
      "http://127.0.0.1:54321/storage/v1/object/public/property-media/abc/photo%201.webp",
    );
    expect(propertyMediaUrl("https://x.supabase.co", null)).toBeNull();
  });
});

const room = (id: string, rent: number | null, deposit: number | null = null): PropertyRoom => ({
  id,
  name: id,
  room_type: "shared",
  capacity: 2,
  rent_per_bed: rent,
  security_deposit: deposit,
  has_attached_bathroom: false,
  has_ac: false,
  has_balcony: false,
  floor: null,
  area_sqft: null,
  description: null,
  beds: [],
});

const base = {
  listing_mode: "entire_unit" as const,
  monthly_rent: 20000,
  security_deposit: 40000,
  maintenance_monthly: 1000,
  electricity_billing: "metered" as const,
  electricity_monthly_estimate: 800,
  water_billing: "included" as const,
  water_monthly_estimate: null,
  food_available: false,
  food_included: false,
  food_monthly_charge: null,
  charges: [
    { id: "c1", label: "Registration", amount: 2000, frequency: "one_time" as const, is_mandatory: true },
    { id: "c2", label: "Laundry", amount: 500, frequency: "monthly" as const, is_mandatory: true },
  ],
  rooms: [],
};

describe("pricedRooms", () => {
  it("keeps rooms with a rent, cheapest first", () => {
    expect(pricedRooms([room("b", 9000), room("a", null), room("c", 7000)]).map((r) => r.id)).toEqual(["c", "b"]);
  });
});

describe("buildCostEstimate", () => {
  it("adds rent, maintenance, metered estimate and mandatory monthly charges; one-time costs go to move-in", () => {
    const view = buildCostEstimate(base);
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.estimate.monthly_total).toBe(20000 + 1000 + 800 + 500);
    expect(view.estimate.move_in_total).toBe(22300 + 40000 + 2000);
  });

  it("uses the chosen room for per-bed listings, the cheapest by default", () => {
    const listing = { ...base, listing_mode: "per_bed" as const, monthly_rent: null, rooms: [room("r1", 9000, 9000), room("r2", 7000)] };
    const cheapest = buildCostEstimate(listing);
    const chosen = buildCostEstimate(listing, "r1");
    expect(cheapest.ok && cheapest.estimate.items[0]?.amount).toBe(7000);
    expect(chosen.ok && chosen.estimate.items[0]?.amount).toBe(9000);
  });

  it("never claims a billing mode the owner did not state", () => {
    const view = buildCostEstimate({ ...base, electricity_billing: null, electricity_monthly_estimate: 999 });
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    const electricity = view.estimate.items.find((item) => item.kind === "electricity");
    expect(electricity).toMatchObject({ label: "Electricity (billing not stated by the owner)", amount: null, counted: false });
    expect(view.estimate.incomplete).toBe(true);
    expect(view.estimate.monthly_total).toBe(20000 + 1000 + 500);
    expect(view.estimate.notes.join(" ")).toContain("has not said how electricity is billed");
    expect(view.estimate.notes.join(" ")).not.toContain("fixed monthly charge");
  });

  it("reports a missing rent instead of guessing", () => {
    expect(buildCostEstimate({ ...base, monthly_rent: null })).toEqual({ ok: false, reason: "no_rent" });
    expect(buildCostEstimate({ ...base, listing_mode: "per_bed", rooms: [room("x", null)] })).toEqual({
      ok: false,
      reason: "no_rent",
    });
  });
});
