import { describe, expect, it } from "vitest";

import { countActiveFilters, inquirySchema, parseSearchFilters, searchFiltersToQuery } from "./schemas";

describe("parseSearchFilters", () => {
  it("returns defaults for an empty query", () => {
    expect(parseSearchFilters({})).toEqual({
      city: undefined,
      q: undefined,
      type: [],
      budget_min: undefined,
      budget_max: undefined,
      gender: undefined,
      food: false,
      amenities: [],
      furnishing: undefined,
      available_only: false,
      sort: "relevance",
      page: 1,
      lat: undefined,
      lng: undefined,
    });
  });

  it("reads the home page's search links (city, type, budgets)", () => {
    const f = parseSearchFilters({ city: "sonipat", type: "hostel", budget_min: "8000", budget_max: "15000" });
    expect(f).toMatchObject({ city: "sonipat", type: ["hostel"], budget_min: 8000, budget_max: 15000 });
  });

  it("accepts repeated keys and comma lists, drops unknown values, sorts and dedupes", () => {
    const f = parseSearchFilters({ type: ["pg", "hostel,castle", "pg"], amenities: "wifi,ac,DROP TABLE,wifi" });
    expect(f.type).toEqual(["hostel", "pg"]);
    expect(f.amenities).toEqual(["ac", "wifi"]);
  });

  it("is lenient: bad values are dropped, not errors", () => {
    const f = parseSearchFilters({
      budget_min: "-5",
      budget_max: "lots",
      gender: "robot",
      furnishing: "palace",
      sort: "random",
      page: "0",
      food: "maybe",
    });
    expect(f).toMatchObject({
      budget_min: undefined,
      budget_max: undefined,
      gender: undefined,
      furnishing: undefined,
      sort: "relevance",
      page: 1,
      food: false,
    });
  });

  it("swaps a reversed budget and understands ₹ and commas", () => {
    expect(parseSearchFilters({ budget_min: "₹20,000", budget_max: "9000" })).toMatchObject({
      budget_min: 9000,
      budget_max: 20000,
    });
  });

  it("keeps lat/lng only as a pair inside India", () => {
    expect(parseSearchFilters({ lat: "28.99312", lng: "77.015134" })).toMatchObject({ lat: 28.99312, lng: 77.01513 });
    expect(parseSearchFilters({ lat: "28.9" })).toMatchObject({ lat: undefined, lng: undefined });
    expect(parseSearchFilters({ lat: "51.5", lng: "-0.1" })).toMatchObject({ lat: undefined, lng: undefined });
  });

  it("trims and caps free text", () => {
    expect(parseSearchFilters({ q: "   near   IIT   Delhi  " }).q).toBe("near IIT Delhi");
    expect(parseSearchFilters({ q: "   " }).q).toBeUndefined();
    expect(parseSearchFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("reads booleans", () => {
    expect(parseSearchFilters({ food: "true", available_only: "1" })).toMatchObject({ food: true, available_only: true });
  });
});

describe("searchFiltersToQuery", () => {
  it("round-trips through parseSearchFilters and leaves defaults out", () => {
    const filters = parseSearchFilters({
      city: "pune",
      type: ["pg", "hostel"],
      budget_max: "12000",
      amenities: ["wifi"],
      food: "true",
      sort: "price_asc",
      page: "3",
    });
    const query = searchFiltersToQuery(filters);
    expect(query).toMatchObject({ city: "pune", type: ["hostel", "pg"], budget_max: 12000, food: "true", sort: "price_asc", page: 3 });
    expect(query.available_only).toBeUndefined();
    const back = parseSearchFilters(query as Record<string, unknown>);
    expect(back).toEqual(filters);
  });

  it("omits page 1 and the default sort", () => {
    const query = searchFiltersToQuery(parseSearchFilters({ page: "1", sort: "relevance" }));
    expect(query.page).toBeUndefined();
    expect(query.sort).toBeUndefined();
  });
});

describe("countActiveFilters", () => {
  it("counts refinements but not city, text or sort", () => {
    expect(countActiveFilters(parseSearchFilters({ city: "pune", q: "x", sort: "newest" }))).toBe(0);
    expect(
      countActiveFilters(parseSearchFilters({ type: ["pg", "hostel"], budget_min: "1", food: "true", amenities: "wifi" })),
    ).toBe(5);
  });
});

describe("inquirySchema", () => {
  it("accepts a normal enquiry and turns empty optionals into null", () => {
    expect(
      inquirySchema.parse({ message: "  Is a bed free from December?  ", move_in_date: "", occupants: "2", room_id: "" }),
    ).toEqual({ message: "Is a bed free from December?", move_in_date: null, occupants: 2, room_id: null });
  });

  it("rejects short messages, bad dates and too many people", () => {
    expect(inquirySchema.safeParse({ message: "hi", occupants: 1 }).success).toBe(false);
    expect(inquirySchema.safeParse({ message: "Hello there owner", occupants: 1, move_in_date: "12/12/2026" }).success).toBe(false);
    expect(inquirySchema.safeParse({ message: "Hello there owner", occupants: 13 }).success).toBe(false);
    expect(inquirySchema.safeParse({ message: "Hello there owner", occupants: 1, room_id: "room-1" }).success).toBe(false);
  });
});
