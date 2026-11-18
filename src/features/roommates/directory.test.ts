import { describe, expect, it } from "vitest";

import {
  DIRECTORY_MAX_PAGE,
  DIRECTORY_PAGE_SIZE,
  directoryHref,
  directoryOffset,
  directoryPageSchema,
  directoryRowSchema,
  lifestyleTags,
  parseDirectoryQuery,
  toDirectoryCard,
} from "./directory";
import { directorySettingsSchema } from "./schemas";

const ROW = {
  user_id: "00000000-0000-4000-8000-000000000001",
  display_name: "Bela",
  city: "Bengaluru",
  preferred_localities: ["Koramangala", "HSR Layout"],
  budget_min: 8000,
  budget_max: 12000,
  move_in_date: "2026-12-01",
  available: true,
  lifestyle: { smoking: 1, food_habit: 1 },
  photo_path: "00000000-0000-4000-8000-000000000001/first.jpg",
};

describe("parseDirectoryQuery", () => {
  it("defaults to no filters on page 1", () => {
    expect(parseDirectoryQuery({})).toEqual({ city: null, available: null, page: 1 });
  });

  it("reads city, availability and page", () => {
    expect(parseDirectoryQuery({ city: " Pune ", available: "yes", page: "3" })).toEqual({ city: "Pune", available: true, page: 3 });
    expect(parseDirectoryQuery({ available: "no" }).available).toBe(false);
  });

  it("takes the first of repeated params", () => {
    expect(parseDirectoryQuery({ city: ["Pune", "Delhi"], page: ["2", "9"] })).toMatchObject({ city: "Pune", page: 2 });
  });

  it("falls back on junk instead of failing", () => {
    expect(parseDirectoryQuery({ city: "x".repeat(81), available: "maybe", page: "-4" })).toEqual({
      city: null,
      available: null,
      page: 1,
    });
    expect(parseDirectoryQuery({ page: "1.5" }).page).toBe(1);
    expect(parseDirectoryQuery({ page: String(DIRECTORY_MAX_PAGE + 1) }).page).toBe(1);
    expect(parseDirectoryQuery({ city: "" }).city).toBeNull();
  });
});

describe("directoryOffset", () => {
  it("turns pages into offsets the database accepts", () => {
    expect(directoryOffset(1)).toBe(0);
    expect(directoryOffset(2)).toBe(DIRECTORY_PAGE_SIZE);
    expect(directoryOffset(0)).toBe(0);
    expect(directoryOffset(DIRECTORY_MAX_PAGE)).toBeLessThanOrEqual(10_000);
    expect(directoryOffset(10_000_000)).toBeLessThanOrEqual(10_000);
  });
});

describe("directoryHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(directoryHref({})).toBe("/roommates/directory");
    expect(directoryHref({ city: null, available: null, page: 1 })).toBe("/roommates/directory");
  });

  it("keeps filters and the page, encoded", () => {
    expect(directoryHref({ city: "New Delhi", available: false, page: 2 })).toBe(
      "/roommates/directory?city=New+Delhi&available=no&page=2",
    );
    expect(directoryHref({ available: true })).toBe("/roommates/directory?available=yes");
  });

  it("round-trips through parseDirectoryQuery", () => {
    const query = { city: "Pune", available: true, page: 4 };
    const search = new URLSearchParams(directoryHref(query).split("?")[1]);
    expect(parseDirectoryQuery(Object.fromEntries(search))).toEqual(query);
  });
});

describe("lifestyleTags", () => {
  it("maps allow-listed answers to short tags in a fixed order", () => {
    expect(lifestyleTags({ smoking: 1, food_habit: 3, pets: 2, sleep_schedule: 5 })).toEqual([
      "Non-veg",
      "Non-smoker",
      "Night owl",
      "Loves pets",
    ]);
  });

  it("ignores questions that are not allow-listed and unknown values", () => {
    expect(lifestyleTags({ noise: 5, guests: 4, smoking: 9 })).toEqual([]);
  });
});

describe("directoryRowSchema / toDirectoryCard", () => {
  it("leaves age and gender empty when the owner hides them (keys absent)", () => {
    const card = toDirectoryCard(directoryRowSchema.parse(ROW), "https://example.test/signed");
    expect(card.age).toBeNull();
    expect(card.gender).toBeNull();
    expect(card.tags).toEqual(["Vegetarian", "Non-smoker"]);
    expect(card.photo_url).toBe("https://example.test/signed");
  });

  it("keeps age and gender when the owner shows them", () => {
    const card = toDirectoryCard(directoryRowSchema.parse({ ...ROW, age: 25, gender: "female" }), null);
    expect(card.age).toBe(25);
    expect(card.gender).toBe("female");
    expect(card.photo_url).toBeNull();
  });

  it("only carries the allowed fields to the browser", () => {
    const row = directoryRowSchema.parse({ ...ROW, phone: "+919800000000", email: "a@b.c", last_active_at: "2026-11-01" });
    expect(Object.keys(toDirectoryCard(row, null)).sort()).toEqual(
      [
        "age",
        "available",
        "budget_max",
        "budget_min",
        "city",
        "display_name",
        "gender",
        "move_in_date",
        "photo_url",
        "preferred_localities",
        "tags",
        "user_id",
      ].sort(),
    );
  });

  it("tolerates bad values without failing the page", () => {
    const row = directoryRowSchema.parse({ ...ROW, gender: "robot", available: "yes", lifestyle: null, photo_path: null });
    expect(row.gender).toBeNull();
    expect(row.available).toBe(false);
    expect(row.lifestyle).toEqual({});
    expect(row.photo_path).toBeNull();
  });

  it("parses a page envelope", () => {
    expect(directoryPageSchema.parse({ items: [ROW], has_more: true, limit: 24, offset: 0 })).toEqual({
      items: [ROW],
      has_more: true,
    });
    expect(directoryPageSchema.parse({})).toEqual({ items: [], has_more: false });
  });
});

describe("directorySettingsSchema", () => {
  it("cannot be visible without consent", () => {
    expect(directorySettingsSchema.parse({ consent: false, visible: true, available: true, show_age_gender: true })).toEqual({
      consent: false,
      visible: false,
      available: true,
      show_age_gender: true,
    });
  });

  it("keeps visibility with consent", () => {
    expect(directorySettingsSchema.parse({ consent: true, visible: true, available: false, show_age_gender: false }).visible).toBe(true);
  });
});
