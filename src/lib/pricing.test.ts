import { describe, expect, it } from "vitest";

import {
  compareMonthlyCosts,
  estimateMonthlyCost,
  formatINR,
  formatINRRange,
  formatMonthly,
  PricingInputError,
  type PricingListing,
  type PricingRoom,
} from "@/lib/pricing";

function listing(overrides: Partial<PricingListing> = {}): PricingListing {
  return {
    listing_mode: "entire_unit",
    monthly_rent: 20000,
    security_deposit: 40000,
    maintenance_monthly: null,
    electricity_billing: "included",
    electricity_monthly_estimate: null,
    water_billing: "included",
    water_monthly_estimate: null,
    food_available: false,
    food_included: false,
    food_monthly_charge: null,
    charges: [],
    ...overrides,
  };
}

const room: PricingRoom = { rent_per_bed: 8000, security_deposit: 16000 };

function perBed(overrides: Partial<PricingListing> = {}): PricingListing {
  return listing({
    listing_mode: "per_bed",
    monthly_rent: null,
    security_deposit: null,
    ...overrides,
  });
}

describe("estimateMonthlyCost: rent and deposit", () => {
  it("uses monthly_rent and the listing deposit for an entire unit", () => {
    const result = estimateMonthlyCost(listing());
    expect(result.listing_mode).toBe("entire_unit");
    expect(result.items[0]).toEqual({
      label: "Rent (entire unit)",
      amount: 20000,
      kind: "rent",
      included: false,
      estimated: false,
      optional: false,
      counted: true,
    });
    expect(result.monthly_total).toBe(20000);
    expect(result.move_in_total).toBe(60000);
    expect(result.incomplete).toBe(false);
    expect(result.move_in_incomplete).toBe(false);
    expect(result.missing).toEqual([]);
  });

  it("ignores a room selection for an entire unit", () => {
    const result = estimateMonthlyCost(listing(), { room });
    expect(result.monthly_total).toBe(20000);
  });

  it("uses the room's rent_per_bed and deposit for a per-bed listing", () => {
    const result = estimateMonthlyCost(perBed(), { room });
    expect(result.listing_mode).toBe("per_bed");
    expect(result.items[0]).toMatchObject({
      label: "Rent (per bed)",
      amount: 8000,
    });
    expect(result.monthly_total).toBe(8000);
    expect(result.move_in_total).toBe(24000);
  });

  it("ignores monthly_rent on a per-bed listing", () => {
    const result = estimateMonthlyCost(perBed({ monthly_rent: 99999 }), {
      room,
    });
    expect(result.monthly_total).toBe(8000);
  });

  it("prefers the bed's rent_override, including an override of zero", () => {
    const withOverride = estimateMonthlyCost(perBed(), {
      room,
      bed: { rent_override: 7500 },
    });
    expect(withOverride.items[0]).toMatchObject({
      label: "Rent (this bed)",
      amount: 7500,
    });
    const zero = estimateMonthlyCost(perBed(), {
      room,
      bed: { rent_override: 0 },
    });
    expect(zero.monthly_total).toBe(0);
  });

  it("falls back to the room rent when the bed has no override", () => {
    const result = estimateMonthlyCost(perBed(), {
      room,
      bed: { rent_override: null },
    });
    expect(result.items[0]).toMatchObject({
      label: "Rent (per bed)",
      amount: 8000,
    });
  });

  it("falls back to the listing deposit when the room has none", () => {
    const result = estimateMonthlyCost(perBed({ security_deposit: 10000 }), {
      room: { rent_per_bed: 8000, security_deposit: null },
    });
    expect(result.move_in_total).toBe(18000);
    expect(result.move_in_incomplete).toBe(false);
  });

  it("keeps a room deposit of zero instead of falling back", () => {
    const result = estimateMonthlyCost(perBed({ security_deposit: 10000 }), {
      room: { rent_per_bed: 8000, security_deposit: 0 },
    });
    expect(result.move_in_total).toBe(8000);
  });

  it("flags an unknown deposit without guessing it", () => {
    const result = estimateMonthlyCost(listing({ security_deposit: null }));
    expect(result.move_in_total).toBe(20000);
    expect(result.move_in_incomplete).toBe(true);
    expect(result.incomplete).toBe(false);
    expect(result.missing).toEqual(["security_deposit"]);
    expect(result.move_in_items[1]).toEqual({
      label: "Security deposit (refundable)",
      amount: null,
      kind: "deposit",
      optional: false,
      counted: false,
    });
    expect(result.notes.join(" ")).toMatch(/deposit is not specified/);
  });
});

describe("estimateMonthlyCost: maintenance", () => {
  it("adds maintenance when positive", () => {
    const result = estimateMonthlyCost(listing({ maintenance_monthly: 1500 }));
    expect(result.items[1]).toMatchObject({
      label: "Maintenance",
      amount: 1500,
      kind: "maintenance",
      counted: true,
    });
    expect(result.monthly_total).toBe(21500);
  });

  it.each([null, 0])("adds no line for maintenance %s", (value) => {
    const result = estimateMonthlyCost(listing({ maintenance_monthly: value }));
    expect(result.items.some((item) => item.kind === "maintenance")).toBe(
      false,
    );
  });
});

describe("estimateMonthlyCost: utilities", () => {
  it("shows included utilities at zero and does not count them", () => {
    const result = estimateMonthlyCost(
      listing({ electricity_monthly_estimate: 900 }),
    );
    const electricity = result.items.find((i) => i.kind === "electricity");
    const water = result.items.find((i) => i.kind === "water");
    expect(electricity).toEqual({
      label: "Electricity (included in rent)",
      amount: 0,
      kind: "electricity",
      included: true,
      estimated: false,
      optional: false,
      counted: false,
    });
    expect(water).toMatchObject({ included: true, amount: 0 });
    expect(result.monthly_total).toBe(20000);
  });

  it("counts a fixed utility as an exact amount", () => {
    const result = estimateMonthlyCost(
      listing({ water_billing: "fixed", water_monthly_estimate: 300 }),
    );
    expect(result.items.find((i) => i.kind === "water")).toEqual({
      label: "Water (fixed monthly charge)",
      amount: 300,
      kind: "water",
      included: false,
      estimated: false,
      optional: false,
      counted: true,
    });
    expect(result.monthly_total).toBe(20300);
    expect(result.incomplete).toBe(false);
  });

  it("flags a fixed utility with no amount", () => {
    const result = estimateMonthlyCost(
      listing({ electricity_billing: "fixed" }),
    );
    expect(result.incomplete).toBe(true);
    expect(result.missing).toEqual(["electricity_estimate"]);
    expect(result.monthly_total).toBe(20000);
  });

  it("counts a metered utility's estimate and marks it as estimated", () => {
    const result = estimateMonthlyCost(
      listing({
        electricity_billing: "metered",
        electricity_monthly_estimate: 1200,
      }),
    );
    expect(result.items.find((i) => i.kind === "electricity")).toEqual({
      label: "Electricity (metered, owner's estimate)",
      amount: 1200,
      kind: "electricity",
      included: false,
      estimated: true,
      optional: false,
      counted: true,
    });
    expect(result.monthly_total).toBe(21200);
    expect(result.incomplete).toBe(false);
    expect(result.notes).toContain(
      "Electricity is metered; ₹1,200 is the owner's estimate and the actual electricity bill will vary.",
    );
  });

  it("never guesses a metered utility without an estimate", () => {
    const result = estimateMonthlyCost(
      listing({ electricity_billing: "metered", water_billing: "metered" }),
    );
    expect(result.monthly_total).toBe(20000);
    expect(result.incomplete).toBe(true);
    expect(result.move_in_incomplete).toBe(true);
    expect(result.missing).toEqual(["electricity_estimate", "water_estimate"]);
    const electricity = result.items.find((i) => i.kind === "electricity");
    expect(electricity).toMatchObject({
      amount: null,
      estimated: true,
      counted: false,
    });
    expect(result.notes).toContain(
      "Water is metered and the owner has not given an estimate; it is not part of this total.",
    );
    expect(result.notes.at(-1)).toMatch(/estimate is incomplete/);
  });

  it("treats a metered estimate of zero as a real number", () => {
    const result = estimateMonthlyCost(
      listing({ water_billing: "metered", water_monthly_estimate: 0 }),
    );
    expect(result.incomplete).toBe(false);
    expect(result.items.find((i) => i.kind === "water")).toMatchObject({
      amount: 0,
      counted: true,
    });
  });
});

describe("estimateMonthlyCost: food", () => {
  it("adds no food line when food is not available", () => {
    const result = estimateMonthlyCost(
      listing({ food_included: true, food_monthly_charge: 3000 }),
    );
    expect(result.items.some((i) => i.kind === "food")).toBe(false);
    expect(result.monthly_total).toBe(20000);
  });

  it("shows included food at zero", () => {
    const result = estimateMonthlyCost(
      listing({
        food_available: true,
        food_included: true,
        food_monthly_charge: 3000,
      }),
    );
    expect(result.items.find((i) => i.kind === "food")).toEqual({
      label: "Food (included in rent)",
      amount: 0,
      kind: "food",
      included: true,
      estimated: false,
      optional: false,
      counted: false,
    });
    expect(result.monthly_total).toBe(20000);
  });

  it("counts optional food by default", () => {
    const result = estimateMonthlyCost(
      listing({ food_available: true, food_monthly_charge: 3000 }),
    );
    expect(result.items.find((i) => i.kind === "food")).toEqual({
      label: "Food (optional)",
      amount: 3000,
      kind: "food",
      included: false,
      estimated: false,
      optional: true,
      counted: true,
    });
    expect(result.monthly_total).toBe(23000);
    expect(result.notes).toContain(
      "Food is optional; ₹3,000/month is counted in this total.",
    );
  });

  it("leaves optional food out when include_food is false", () => {
    const result = estimateMonthlyCost(
      listing({ food_available: true, food_monthly_charge: 3000 }),
      {},
      { include_food: false },
    );
    expect(result.items.find((i) => i.kind === "food")).toMatchObject({
      amount: 3000,
      counted: false,
    });
    expect(result.monthly_total).toBe(20000);
    expect(result.notes).toContain(
      "Food is optional (₹3,000/month) and is not counted in this total.",
    );
  });

  it("flags optional food without a charge only when food is wanted", () => {
    const wanted = estimateMonthlyCost(listing({ food_available: true }));
    expect(wanted.incomplete).toBe(true);
    expect(wanted.missing).toEqual(["food_charge"]);
    expect(wanted.items.find((i) => i.kind === "food")).toMatchObject({
      amount: null,
      counted: false,
    });

    const notWanted = estimateMonthlyCost(
      listing({ food_available: true }),
      {},
      { include_food: false },
    );
    expect(notWanted.incomplete).toBe(false);
    expect(notWanted.missing).toEqual([]);
  });

  it("does not let include_food remove food that is part of the rent", () => {
    const result = estimateMonthlyCost(
      listing({ food_available: true, food_included: true }),
      {},
      { include_food: false },
    );
    expect(result.items.find((i) => i.kind === "food")).toMatchObject({
      included: true,
    });
  });
});

describe("estimateMonthlyCost: additional charges", () => {
  const charges = [
    { label: "Wi-Fi", amount: 500, frequency: "monthly", is_mandatory: true },
    {
      label: "Laundry",
      amount: 400,
      frequency: "monthly",
      is_mandatory: false,
    },
    {
      label: "Society fee",
      amount: 5000,
      frequency: "yearly",
      is_mandatory: true,
    },
    {
      label: "Locker",
      amount: 1200,
      frequency: "yearly",
      is_mandatory: false,
    },
    {
      label: "Onboarding",
      amount: 2000,
      frequency: "one_time",
      is_mandatory: true,
    },
    {
      label: "Mattress",
      amount: 1500,
      frequency: "one_time",
      is_mandatory: false,
    },
  ] as const;

  it("counts only mandatory charges by default", () => {
    const result = estimateMonthlyCost(listing({ charges }));
    // 20000 + 500 + ceil(5000 / 12) = 20917
    expect(result.monthly_total).toBe(20917);
    // 20917 + 40000 + 2000
    expect(result.move_in_total).toBe(62917);
    const labels = result.items
      .filter((i) => i.kind === "charge")
      .map((i) => [i.label, i.amount, i.optional, i.counted]);
    expect(labels).toEqual([
      ["Wi-Fi", 500, false, true],
      ["Laundry (optional)", 400, true, false],
      ["Society fee (₹5,000 per year, shown per month)", 417, false, true],
      [
        "Locker (₹1,200 per year, shown per month) (optional)",
        100,
        true,
        false,
      ],
    ]);
    expect(result.move_in_items).toEqual([
      {
        label: "First month",
        amount: 20917,
        kind: "first_month",
        optional: false,
        counted: true,
      },
      {
        label: "Security deposit (refundable)",
        amount: 40000,
        kind: "deposit",
        optional: false,
        counted: true,
      },
      {
        label: "Onboarding",
        amount: 2000,
        kind: "charge",
        optional: false,
        counted: true,
      },
      {
        label: "Mattress (optional)",
        amount: 1500,
        kind: "charge",
        optional: true,
        counted: false,
      },
    ]);
    expect(result.notes).toContain(
      "3 optional charges are listed but not counted.",
    );
  });

  it("counts optional charges when asked", () => {
    const result = estimateMonthlyCost(
      listing({ charges }),
      {},
      { include_optional_charges: true },
    );
    // 20917 + 400 + 100
    expect(result.monthly_total).toBe(21417);
    // 21417 + 40000 + 2000 + 1500
    expect(result.move_in_total).toBe(64917);
    expect(result.items.every((i) => i.kind !== "charge" || i.counted)).toBe(
      true,
    );
    expect(result.notes.some((n) => n.includes("not counted"))).toBe(false);
  });

  it("uses the singular note for one optional charge", () => {
    const result = estimateMonthlyCost(listing({ charges: [charges[1]] }));
    expect(result.notes).toContain(
      "1 optional charge is listed but not counted.",
    );
  });

  it.each([
    [0, 0],
    [1, 1],
    [12, 1],
    [13, 2],
    [1200, 100],
    [1201, 101],
    [5000, 417],
  ])("spreads a yearly charge of %i to %i per month, rounded up", (y, m) => {
    const result = estimateMonthlyCost(
      listing({
        charges: [
          { label: "Fee", amount: y, frequency: "yearly", is_mandatory: true },
        ],
      }),
    );
    expect(result.monthly_total).toBe(20000 + m);
  });

  it("accepts a missing charges list and names an unlabelled charge", () => {
    expect(estimateMonthlyCost(listing({ charges: null })).monthly_total).toBe(
      20000,
    );
    expect(
      estimateMonthlyCost(listing({ charges: undefined })).monthly_total,
    ).toBe(20000);
    const result = estimateMonthlyCost(
      listing({
        charges: [
          {
            label: "  ",
            amount: 100,
            frequency: "monthly",
            is_mandatory: true,
          },
        ],
      }),
    );
    expect(result.items.at(-1)?.label).toBe("Other charge");
  });
});

describe("estimateMonthlyCost: full formula", () => {
  it("adds every component for a per-bed option", () => {
    const result = estimateMonthlyCost(
      perBed({
        maintenance_monthly: 500,
        electricity_billing: "metered",
        electricity_monthly_estimate: 700,
        water_billing: "fixed",
        water_monthly_estimate: 150,
        food_available: true,
        food_monthly_charge: 3500,
        charges: [
          {
            label: "Wi-Fi",
            amount: 300,
            frequency: "monthly",
            is_mandatory: true,
          },
          {
            label: "Registration",
            amount: 1000,
            frequency: "one_time",
            is_mandatory: true,
          },
        ],
      }),
      { room, bed: { rent_override: 8500 } },
    );
    expect(result.monthly_total).toBe(8500 + 500 + 700 + 150 + 3500 + 300);
    expect(result.move_in_total).toBe(result.monthly_total + 16000 + 1000);
    expect(result.items.map((i) => i.kind)).toEqual([
      "rent",
      "maintenance",
      "electricity",
      "water",
      "food",
      "charge",
    ]);
    expect(result.incomplete).toBe(false);
  });

  it("totals equal the sum of counted lines", () => {
    const result = estimateMonthlyCost(
      listing({
        maintenance_monthly: 999,
        electricity_billing: "metered",
        food_available: true,
        food_monthly_charge: 2500,
      }),
    );
    const sum = result.items
      .filter((i) => i.counted)
      .reduce((total, i) => total + (i.amount ?? 0), 0);
    expect(result.monthly_total).toBe(sum);
    expect(result.items.every((i) => i.amount !== null || !i.counted)).toBe(
      true,
    );
  });

  it("does not mutate its input", () => {
    const input = listing({
      charges: [
        { label: "Fee", amount: 100, frequency: "yearly", is_mandatory: true },
      ],
    });
    const snapshot = JSON.parse(JSON.stringify(input));
    estimateMonthlyCost(input);
    expect(input).toEqual(snapshot);
  });
});

describe("estimateMonthlyCost: invalid input", () => {
  it.each([
    ["monthly_rent", { monthly_rent: -1 }],
    ["monthly_rent", { monthly_rent: 100.5 }],
    ["monthly_rent", { monthly_rent: Number.NaN }],
    ["monthly_rent", { monthly_rent: Number.POSITIVE_INFINITY }],
    ["monthly_rent", { monthly_rent: null }],
    ["monthly_rent", { monthly_rent: "20000" as unknown as number }],
    ["security_deposit", { security_deposit: -5 }],
    ["maintenance_monthly", { maintenance_monthly: 0.1 }],
    ["electricity_monthly_estimate", { electricity_monthly_estimate: -1 }],
    ["water_monthly_estimate", { water_monthly_estimate: 1.5 }],
    ["food_monthly_charge", { food_monthly_charge: -100 }],
    ["electricity_billing", { electricity_billing: "free" as never }],
    ["water_billing", { water_billing: undefined as never }],
    ["food_available", { food_available: "yes" as never }],
    ["food_included", { food_included: null as never }],
    ["listing_mode", { listing_mode: "per_room" as never }],
  ] as const)("rejects a bad %s", (field, overrides) => {
    let error: unknown;
    try {
      estimateMonthlyCost(listing(overrides as Partial<PricingListing>));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PricingInputError);
    expect(error).toBeInstanceOf(RangeError);
    expect((error as PricingInputError).field).toBe(field);
  });

  it("requires a room for a per-bed listing", () => {
    expect(() => estimateMonthlyCost(perBed())).toThrow(PricingInputError);
    expect(() => estimateMonthlyCost(perBed(), { room: null })).toThrow(
      /room must be chosen/,
    );
  });

  it.each([
    [{ rent_per_bed: -1, security_deposit: 0 }, undefined, "room.rent_per_bed"],
    [
      { rent_per_bed: 8000.5, security_deposit: 0 },
      undefined,
      "room.rent_per_bed",
    ],
    [
      { rent_per_bed: 8000, security_deposit: -1 },
      undefined,
      "room.security_deposit",
    ],
    [
      { rent_per_bed: 8000, security_deposit: 0 },
      { rent_override: -1 },
      "bed.rent_override",
    ],
    [
      { rent_per_bed: 8000, security_deposit: 0 },
      { rent_override: 7999.99 },
      "bed.rent_override",
    ],
  ] as const)("rejects bad room or bed amounts (%#)", (badRoom, bed, field) => {
    expect(() => estimateMonthlyCost(perBed(), { room: badRoom, bed })).toThrow(
      new RegExp(`^${field.replace(".", "\\.")}:`),
    );
  });

  it.each([
    [{ amount: -1 }, "charges[0].amount"],
    [{ amount: 10.5 }, "charges[0].amount"],
    [{ frequency: "weekly" as never }, "charges[0].frequency"],
    [{ is_mandatory: 1 as never }, "charges[0].is_mandatory"],
  ])("rejects a bad charge %#", (overrides, field) => {
    const charge = {
      label: "Fee",
      amount: 100,
      frequency: "monthly" as const,
      is_mandatory: true,
      ...overrides,
    };
    let error: unknown;
    try {
      estimateMonthlyCost(listing({ charges: [charge] }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PricingInputError);
    expect((error as PricingInputError).field).toBe(field);
  });

  it("rejects bad optional charges even when they are not counted", () => {
    expect(() =>
      estimateMonthlyCost(
        listing({
          charges: [
            {
              label: "Gym",
              amount: -50,
              frequency: "monthly",
              is_mandatory: false,
            },
          ],
        }),
      ),
    ).toThrow(PricingInputError);
  });
});

describe("compareMonthlyCosts", () => {
  it("returns an empty list for no input", () => {
    expect(compareMonthlyCosts([])).toEqual([]);
  });

  it("sorts by monthly total and reports the gap to the cheapest", () => {
    const rows = compareMonthlyCosts([
      { id: "flat", label: "2 BHK", listing: listing() },
      { id: "pg", label: "PG bed", listing: perBed(), selection: { room } },
      {
        id: "studio",
        listing: listing({ monthly_rent: 14000, maintenance_monthly: 1000 }),
      },
    ]);
    expect(rows.map((r) => [r.id, r.rank, r.monthly_total])).toEqual([
      ["pg", 1, 8000],
      ["studio", 2, 15000],
      ["flat", 3, 20000],
    ]);
    expect(rows.map((r) => r.difference_from_cheapest)).toEqual([
      0, 7000, 12000,
    ]);
    expect(rows[0]?.label).toBe("PG bed");
    expect(rows[1]?.label).toBeNull();
    expect(rows[0]?.move_in_total).toBe(24000);
    expect(rows[0]?.estimate.items[0]?.kind).toBe("rent");
  });

  it("puts complete estimates before incomplete ones on a tie, then input order", () => {
    const rows = compareMonthlyCosts([
      { id: "metered", listing: listing({ electricity_billing: "metered" }) },
      { id: "first", listing: listing() },
      { id: "second", listing: listing() },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["first", "second", "metered"]);
    expect(rows.map((r) => r.incomplete)).toEqual([false, false, true]);
    expect(rows[2]?.move_in_incomplete).toBe(true);
  });

  it("applies per-entry options", () => {
    const withFood = listing({
      food_available: true,
      food_monthly_charge: 3000,
    });
    const rows = compareMonthlyCosts([
      { id: "with", listing: withFood },
      { id: "without", listing: withFood, options: { include_food: false } },
    ]);
    expect(rows.map((r) => [r.id, r.monthly_total])).toEqual([
      ["without", 20000],
      ["with", 23000],
    ]);
  });

  it("does not reorder the caller's array and propagates invalid input", () => {
    const input = [
      { id: "b", listing: listing({ monthly_rent: 2 }) },
      { id: "a", listing: listing({ monthly_rent: 1 }) },
    ];
    compareMonthlyCosts(input);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
    expect(() =>
      compareMonthlyCosts([
        { id: "x", listing: listing({ monthly_rent: -1 }) },
      ]),
    ).toThrow(PricingInputError);
  });
});

describe("formatting", () => {
  it("formats rupees with Indian digit grouping and no paise", () => {
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(8000)).toBe("₹8,000");
    expect(formatINR(100000)).toBe("₹1,00,000");
    expect(formatINR(12345678)).toBe("₹1,23,45,678");
  });

  it("rejects non-finite amounts", () => {
    expect(() => formatINR(Number.NaN)).toThrow(PricingInputError);
    expect(() => formatINR(Number.POSITIVE_INFINITY)).toThrow(
      PricingInputError,
    );
  });

  it("formats ranges with an en dash and collapses equal ends", () => {
    expect(formatINRRange(8000, 12000)).toBe("₹8,000–₹12,000");
    expect(formatINRRange(12000, 8000)).toBe("₹8,000–₹12,000");
    expect(formatINRRange(9000, 9000)).toBe("₹9,000");
  });

  it("formats a monthly amount", () => {
    expect(formatMonthly(15500)).toBe("₹15,500/month");
  });
});
