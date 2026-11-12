import { describe, expect, it } from "vitest";

import { parseConversation, parseRequirements, type CityRef } from "./parser";

const cities: CityRef[] = [
  { slug: "bengaluru", name: "Bengaluru" },
  { slug: "pune", name: "Pune" },
  { slug: "hyderabad", name: "Hyderabad" },
  { slug: "gurugram", name: "Gurugram" },
  { slug: "delhi", name: "Delhi" },
];

describe("parseRequirements", () => {
  it("reads the canonical example", () => {
    const req = parseRequirements("PG in Bangalore under ₹8000 with food and wifi", cities);
    expect(req).toMatchObject({
      city: "bengaluru",
      budget_max: 8000,
      budget_min: null,
      types: ["boys_pg", "girls_pg", "pg"],
      food: true,
      amenities: ["wifi"],
      gender: null,
      missing: [],
      is_search: true,
    });
  });

  it("understands k, lakh, commas and ranges", () => {
    expect(parseRequirements("room in pune below 9.5k", cities).budget_max).toBe(9500);
    expect(parseRequirements("flat in pune budget 1 lakh", cities).budget_max).toBe(100000);
    expect(parseRequirements("pg pune upto Rs. 12,000", cities).budget_max).toBe(12000);
    const range = parseRequirements("1 BHK in Hyderabad between ₹12000 and ₹18000", cities);
    expect(range).toMatchObject({ budget_min: 12000, budget_max: 18000, types: ["one_bhk"] });
    expect(parseRequirements("2bhk delhi 15k-20k", cities)).toMatchObject({ budget_min: 15000, budget_max: 20000 });
  });

  it("does not read BHK counts or small numbers as money", () => {
    const req = parseRequirements("2 bhk in pune", cities);
    expect(req.budget_max).toBeNull();
    expect(req.missing).toEqual(["budget"]);
  });

  it("maps gender to the right PG types", () => {
    expect(parseRequirements("girls pg in pune", cities)).toMatchObject({ gender: "female", types: ["girls_pg", "pg"] });
    expect(parseRequirements("boys hostel in gurgaon", cities)).toMatchObject({
      gender: "male",
      city: "gurugram",
      types: ["hostel"],
    });
    expect(parseRequirements("PG for women in Pune", cities).gender).toBe("female");
  });

  it("reads AC and other amenities, and 'without food'", () => {
    const req = parseRequirements("private room in pune with AC, attached bathroom and parking without food", cities);
    expect(req.amenities).toEqual(["ac", "attached_bathroom", "parking"]);
    expect(req.food).toBe(false);
    expect(req.types).toEqual(["private_room"]);
    expect(parseRequirements("air conditioned room pune", cities).amenities).toEqual(["ac"]);
  });

  it("captures a locality after 'near' but not a city", () => {
    expect(parseRequirements("pg near Koramangala in Bangalore under 9k", cities).near).toBe("koramangala");
    expect(parseRequirements("pg near pune under 9k", cities).near).toBeNull();
  });

  it("flags what is missing and non-search messages", () => {
    expect(parseRequirements("cheap pg with food", cities).missing).toEqual(["city", "budget"]);
    expect(parseRequirements("hello there", cities).is_search).toBe(false);
  });
});

describe("parseConversation", () => {
  it("fills gaps from earlier user turns, latest wins", () => {
    const req = parseConversation("under 9000", ["girls PG in Pune with wifi"], cities);
    expect(req).toMatchObject({ city: "pune", budget_max: 9000, gender: "female", amenities: ["wifi"], missing: [] });
    const changed = parseConversation("actually in Bengaluru", ["PG in Pune under 8k"], cities);
    expect(changed).toMatchObject({ city: "bengaluru", budget_max: 8000 });
  });
});

describe("guidanceFor", () => {
  it("answers general renting topics without mixing them up", async () => {
    const { guidanceFor } = await import("./basic");
    expect(guidanceFor("How much security deposit is normal?")).toMatch(/^Security deposits/);
    expect(guidanceFor("How much security deposit is normal?")).not.toMatch(/CCTV/);
    expect(guidanceFor("is it safe to pay a token amount?")).toMatch(/token amount/);
    expect(guidanceFor("hello")).toBeNull();
  });
});
