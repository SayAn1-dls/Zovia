import { describe, expect, it } from "vitest";

import { listingGaps } from "./completeness";

const complete = {
  description: "A bright, quiet PG with study tables and meals.",
  city: "Bengaluru",
  locality: "Koramangala",
  address_line: "12 Hosur Road",
  location: { lat: 12.93, lng: 77.62 },
  media: [{ id: "m" }] as never,
  listing_mode: "per_bed" as const,
  rooms: [{ beds: [{ id: "b" }] }] as never,
  monthly_rent: null,
  availability: null,
};

describe("listingGaps", () => {
  it("is empty for a complete per-bed listing", () => {
    expect(listingGaps(complete)).toEqual([]);
  });

  it("lists what a fresh draft is missing, in the SQL function's order", () => {
    expect(
      listingGaps({ ...complete, description: "short", location: null, media: [], rooms: [] as never }),
    ).toEqual(["description", "map_pin", "photos", "beds"]);
    expect(listingGaps({ ...complete, locality: null })).toEqual(["address"]);
  });

  it("checks rent and availability for entire units instead of beds", () => {
    expect(listingGaps({ ...complete, listing_mode: "entire_unit", rooms: [] as never })).toEqual(["rent", "availability"]);
    expect(
      listingGaps({ ...complete, listing_mode: "entire_unit", monthly_rent: 20000, availability: { status: "available" } as never }),
    ).toEqual([]);
  });
});
