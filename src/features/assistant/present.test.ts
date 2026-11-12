import { describe, expect, it } from "vitest";

import { selectPresentedCards } from "./present";
import type { AssistantPropertyCard } from "./schemas";

function card(id: string): AssistantPropertyCard {
  return {
    id,
    slug: `listing-${id.slice(0, 4)}`,
    title: `Listing ${id.slice(0, 4)}`,
    property_type: "pg",
    listing_mode: "per_bed",
    locality: "Koramangala",
    city: "Bengaluru",
    price_from: 8000,
    available_beds: 2,
    total_beds: 4,
    cover_url: null,
    rating_avg: null,
    rating_count: 0,
  };
}

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const C = "cccccccc-0000-4000-8000-000000000003";

describe("selectPresentedCards", () => {
  const seen = new Map([A, B, C].map((id) => [id, card(id)]));

  it("keeps only ids a tool returned, in the model's order", () => {
    const fake = "dddddddd-0000-4000-8000-000000000004";
    const { cards, dropped } = selectPresentedCards([B, fake, A, "not-an-id"], seen);
    expect(cards.map((c) => c.id)).toEqual([B, A]);
    expect(dropped).toEqual([fake, "not-an-id"]);
  });

  it("returns the database row, never model-supplied data", () => {
    const { cards } = selectPresentedCards([A], seen);
    expect(cards[0]).toBe(seen.get(A));
  });

  it("ignores case, whitespace and duplicates, and caps the count", () => {
    const { cards } = selectPresentedCards([` ${A.toUpperCase()} `, A, B, C], seen, 2);
    expect(cards.map((c) => c.id)).toEqual([A, B]);
  });

  it("returns nothing when no tool returned listings", () => {
    expect(selectPresentedCards([A], new Map()).cards).toEqual([]);
  });
});
