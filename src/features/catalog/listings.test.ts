import { describe, expect, it } from "vitest";

import { CATALOG_CITIES } from "./cities";
import { allCatalogListings, catalogListingsForCity, getCatalogListing, searchCatalog, similarCatalogListings } from "./listings";

describe("PG catalogue", () => {
  it("covers every city with photos, rent, rules and a pin near the city", () => {
    for (const city of CATALOG_CITIES) {
      const listings = catalogListingsForCity(city.slug);
      expect(listings.length).toBeGreaterThanOrEqual(8);
      for (const listing of listings) {
        expect(listing.photos.length).toBeGreaterThanOrEqual(4);
        expect(listing.sharing.length).toBeGreaterThan(0);
        expect(listing.price_from).toBeGreaterThan(3000);
        expect(Math.abs(listing.lat - city.lat)).toBeLessThan(0.4);
        expect(Math.abs(listing.lng - city.lng)).toBeLessThan(0.4);
      }
    }
  });

  it("gives every listing a unique, URL-safe slug that resolves", () => {
    const slugs = allCatalogListings().map((listing) => listing.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(getCatalogListing(slug)?.slug).toBe(slug);
    }
  });

  it("is deterministic", () => {
    const first = catalogListingsForCity("pune")[0]!;
    expect(getCatalogListing(first.slug)).toEqual(first);
  });

  it("applies search filters", () => {
    const women = searchCatalog({ city: "kolkata", gender: "female" });
    expect(women.length).toBeGreaterThan(0);
    expect(women.every((listing) => listing.gender !== "male")).toBe(true);
    expect(searchCatalog({ city: "atlantis" })).toEqual([]);
    const cheap = searchCatalog({ budget_max: 6000 });
    expect(cheap.every((listing) => listing.price_from <= 6000)).toBe(true);
  });

  it("suggests other places in the same city", () => {
    const listing = catalogListingsForCity("indore")[0]!;
    const similar = similarCatalogListings(listing);
    expect(similar).toHaveLength(3);
    expect(similar.every((other) => other.city_slug === "indore" && other.slug !== listing.slug)).toBe(true);
  });
});
