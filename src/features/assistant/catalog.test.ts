import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  catalogListingsNamed,
  catalogRentStats,
  searchCatalogSorted,
  catalogDetailView,
  catalogListingById,
} = await import("./catalog");

describe("assistant catalogue", () => {
  it("only returns listings that meet every requirement", () => {
    const list = searchCatalogSorted(
      { city: "pune", diet: "veg", smoking: "free", budget_max: 12000 },
      "price_asc",
    );
    expect(list.length).toBeGreaterThan(0);
    for (const listing of list) {
      expect(listing.city_slug).toBe("pune");
      expect(listing.food.diet).toBe("veg");
      expect(listing.rules.smoking).toBe("not_allowed");
      expect(listing.price_from).toBeLessThanOrEqual(12000);
    }
    expect(list.map((l) => l.price_from)).toEqual(
      [...list.map((l) => l.price_from)].sort((a, b) => a - b),
    );
  });

  it("applies the budget to the room type asked for", () => {
    for (const listing of searchCatalogSorted({
      city: "mumbai",
      sharing: "single",
      budget_max: 20000,
    })) {
      expect(
        listing.sharing.some((o) => o.type === "single" && o.rent <= 20000),
      ).toBe(true);
    }
  });

  it("finds a listing by its name and describes it with nearby places", () => {
    const [any] = searchCatalogSorted({ city: "pune" });
    const named = catalogListingsNamed(
      `tell me about ${any!.title} in ${any!.locality}`,
    );
    expect(named[0]!.slug).toBe(any!.slug);
    expect(catalogListingById(any!.id)?.slug).toBe(any!.slug);
    expect(catalogDetailView(any!).rooms.length).toBeGreaterThan(0);
  });

  it("summarises rent in a city", () => {
    const stats = catalogRentStats("bengaluru")!;
    expect(stats.count).toBeGreaterThan(0);
    expect(stats.min).toBeLessThanOrEqual(stats.median);
    expect(stats.median).toBeLessThanOrEqual(stats.max);
    expect(catalogRentStats("atlantis")).toBeNull();
  });
});
