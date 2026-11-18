import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { allCatalogListings } from "@/features/catalog/listings";

import { STAY_INVENTORY_SQL_PATH, stayInventoryRows, stayInventorySql } from "../../../scripts/sync-stay-inventory";
import { STAY_ROOM_TYPES } from "./schemas";

describe("stay inventory sync", () => {
  it("the committed SQL matches the catalogue (run `pnpm exec tsx scripts/sync-stay-inventory.ts` to refresh)", () => {
    expect(readFileSync(STAY_INVENTORY_SQL_PATH, "utf8")).toBe(stayInventorySql());
  });

  it("has one row per listing and room type, with beds left, rent and room facts", () => {
    const rows = stayInventoryRows();
    const listings = allCatalogListings();
    expect(rows).toHaveLength(listings.reduce((sum, listing) => sum + listing.sharing.length, 0));
    expect(new Set(rows.map((row) => `${row.listing_ref}/${row.room_type}`)).size).toBe(rows.length);

    for (const listing of listings) {
      for (const option of listing.sharing) {
        expect(rows).toContainEqual({
          listing_ref: listing.slug,
          room_type: option.type,
          units: option.beds_left,
          rent_per_month: option.rent,
          ac: option.ac,
          attached_bathroom: option.attached_bathroom,
        });
      }
    }
  });

  it("only produces values the database accepts", () => {
    for (const row of stayInventoryRows()) {
      expect(STAY_ROOM_TYPES).toContain(row.room_type);
      expect(Number.isInteger(row.units) && row.units >= 0 && row.units <= 500).toBe(true);
      expect(Number.isInteger(row.rent_per_month) && row.rent_per_month > 0).toBe(true);
      expect(row.listing_ref.length).toBeGreaterThan(0);
      expect(row.listing_ref.length).toBeLessThanOrEqual(200);
    }
  });

  it("escapes quotes in identifiers", () => {
    const sql = stayInventorySql([
      { listing_ref: "o'brien-pg", room_type: "single", units: 1, rent_per_month: 9000, ac: true, attached_bathroom: false },
    ]);
    expect(sql).toContain("('o''brien-pg', 'single', 1, 9000, true, false)");
  });
});
