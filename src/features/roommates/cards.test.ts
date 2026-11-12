import { describe, expect, it } from "vitest";

import { parseLocalities, rankDeck, toPublicCard, weightsFromRows } from "./cards";
import { DEFAULT_WEIGHTS } from "./compatibility";
import { FULL_ANSWERS } from "./compatibility/fixtures";
import { cardRowSchema, type CardRow } from "./schemas";

function row(overrides: Partial<CardRow> = {}): CardRow {
  return cardRowSchema.parse({
    user_id: "00000000-0000-4000-8000-000000000001",
    display_name: "Asha",
    avatar_path: null,
    status: "active",
    headline: "Calm designer",
    about: null,
    age: 25,
    gender: "female",
    occupation: "working_professional",
    occupation_detail: null,
    city: "Bengaluru",
    preferred_localities: ["Koramangala"],
    budget_min: 8000,
    budget_max: 12000,
    move_in_date: null,
    has_place: false,
    last_active_at: "2026-11-10T10:00:00Z",
    photos: [],
    answers: FULL_ANSWERS,
    deal_breakers: [],
    preferences: null,
    place: null,
    ...overrides,
  });
}

describe("cardRowSchema", () => {
  it("tolerates missing optional parts of a database card", () => {
    const parsed = cardRowSchema.parse({ user_id: "00000000-0000-4000-8000-000000000009", status: "active" });
    expect(parsed.photos).toEqual([]);
    expect(parsed.answers).toEqual({});
    expect(parsed.preferences).toBeNull();
    expect(parsed.display_name).toBe("Member");
  });
});

describe("toPublicCard", () => {
  it("never exposes answers, deal-breakers or preferences", () => {
    const card = toPublicCard(row({ deal_breakers: ["smoking"] }), { avatar_url: null, photo_urls: ["u"] });
    expect(card).not.toHaveProperty("answers");
    expect(card).not.toHaveProperty("deal_breakers");
    expect(card).not.toHaveProperty("preferences");
    expect(card.photo_urls).toEqual(["u"]);
  });
});

describe("weightsFromRows", () => {
  it("uses database weights when they are complete and sum to 1", () => {
    const rows = Object.entries(DEFAULT_WEIGHTS).map(([factor, weight]) => ({ factor, weight: String(weight) }));
    const result = weightsFromRows(rows);
    expect(result.valid).toBe(true);
    expect(result.weights).toEqual(DEFAULT_WEIGHTS);
  });

  it("falls back to the defaults and reports why when rows are incomplete", () => {
    const result = weightsFromRows([{ factor: "budget", weight: 1 }]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.weights).toEqual(DEFAULT_WEIGHTS);
  });
});

describe("rankDeck", () => {
  it("drops candidates that fail a deal-breaker and ranks the rest by score", () => {
    const me = row({ deal_breakers: ["smoking"] });
    const smoker = row({ user_id: "00000000-0000-4000-8000-000000000002", answers: { ...FULL_ANSWERS, smoking: 3 } });
    const twin = row({ user_id: "00000000-0000-4000-8000-000000000003" });
    const different = row({
      user_id: "00000000-0000-4000-8000-000000000004",
      answers: { ...FULL_ANSWERS, cleanliness: 1, sleep_schedule: 5, noise: 5 },
      budget_min: 20000,
      budget_max: 30000,
    });
    const deck = rankDeck(me, [different, smoker, twin], DEFAULT_WEIGHTS, 10);
    expect(deck.map((entry) => entry.row.user_id)).toEqual([twin.user_id, different.user_id]);
    expect(deck[0]!.result.score).toBeGreaterThan(deck[1]!.result.score);
  });

  it("respects the limit", () => {
    const pool = [2, 3, 4].map((n) => row({ user_id: `00000000-0000-4000-8000-00000000000${n}` }));
    expect(rankDeck(row(), pool, DEFAULT_WEIGHTS, 2)).toHaveLength(2);
  });
});

describe("parseLocalities", () => {
  it("trims, de-duplicates case-insensitively and caps the list", () => {
    expect(parseLocalities(" Koramangala, hsr layout ,koramangala,,X, HSR  Layout")).toEqual(["Koramangala", "hsr layout"]);
    expect(parseLocalities("a1,b2,c3", 2)).toEqual(["a1", "b2"]);
  });
});
