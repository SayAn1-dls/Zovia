import { describe, expect, it } from "vitest";

import { roommateProfileSchema, swipeSchema, type RoommateProfileFormValues } from "./schemas";

const base: RoommateProfileFormValues = {
  headline: "Calm designer",
  about: "",
  age: "25",
  gender: "female",
  occupation: "",
  occupation_detail: "",
  city: "Bengaluru",
  preferred_localities: [],
  budget_min: "8000",
  budget_max: "12000",
  move_in_date: "",
  has_place: false,
  place: null,
  preferred_genders: [],
  age_min: "",
  age_max: "",
  occupation_prefs: [],
  answers: { smoking: 1 },
  deal_breakers: ["smoking"],
  status: "active",
};

describe("roommateProfileSchema", () => {
  it("coerces form strings and turns empty optionals into null", () => {
    const parsed = roommateProfileSchema.parse(base);
    expect(parsed.age).toBe(25);
    expect(parsed.budget_min).toBe(8000);
    expect(parsed.about).toBeNull();
    expect(parsed.occupation).toBeNull();
    expect(parsed.move_in_date).toBeNull();
    expect(parsed.age_min).toBeNull();
  });

  it("requires gender, age and an ordered budget", () => {
    const missing = roommateProfileSchema.safeParse({ ...base, gender: "", age: "" });
    expect(missing.error?.issues.map((issue) => issue.path.join("."))).toEqual(expect.arrayContaining(["gender", "age"]));
    const reversed = roommateProfileSchema.safeParse({ ...base, budget_min: "15000" });
    expect(reversed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["budget_max"]);
  });

  it("requires place details when the person has a place", () => {
    const result = roommateProfileSchema.safeParse({ ...base, has_place: true, place: null });
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("place.title");
  });

  it("rejects unknown deal-breaker codes", () => {
    expect(roommateProfileSchema.safeParse({ ...base, deal_breakers: ["vegan"] }).success).toBe(false);
  });
});

describe("swipeSchema", () => {
  it("accepts like / pass on a uuid only", () => {
    expect(swipeSchema.safeParse({ target_id: "00000000-0000-4000-8000-000000000001", action: "like" }).success).toBe(true);
    expect(swipeSchema.safeParse({ target_id: "me", action: "like" }).success).toBe(false);
    expect(swipeSchema.safeParse({ target_id: "00000000-0000-4000-8000-000000000001", action: "superlike" }).success).toBe(false);
  });
});
