import { describe, expect, it } from "vitest";

import { buildPricingPreview, toAmount, type PreviewPricing } from "./pricing-preview";

const pricing: PreviewPricing = {
  monthly_rent: null,
  security_deposit: 10000,
  maintenance_monthly: 500,
  electricity_billing: "metered",
  electricity_monthly_estimate: 800,
  water_billing: "included",
  water_monthly_estimate: 300,
  food_available: true,
  food_included: false,
  food_monthly_charge: 3000,
};

describe("toAmount", () => {
  it("parses whole rupees only", () => {
    expect(toAmount("8000")).toBe(8000);
    expect(toAmount(" 0 ")).toBe(0);
    expect(toAmount("")).toBeNull();
    expect(toAmount("12.5")).toBeNull();
    expect(toAmount("-3")).toBeNull();
    expect(toAmount(null)).toBeNull();
  });
});

describe("buildPricingPreview", () => {
  it("uses the cheapest priced room for per-bed listings", () => {
    const preview = buildPricingPreview({
      listing_mode: "per_bed",
      pricing,
      rooms: [
        { name: "Room A", rent_per_bed: 9000, security_deposit: null },
        { name: "Room B", rent_per_bed: 7000, security_deposit: 7000 },
        { name: "Room C", rent_per_bed: null, security_deposit: null },
      ],
      charges: [{ label: "Laundry", amount: 300, frequency: "monthly", is_mandatory: true }],
    });
    expect(preview.kind).toBe("estimate");
    if (preview.kind !== "estimate") return;
    expect(preview.basis).toBe("Cheapest bed (Room B)");
    // 7000 rent + 500 maintenance + 800 electricity + 3000 food + 300 laundry; water included
    expect(preview.estimate.monthly_total).toBe(11600);
    expect(preview.estimate.incomplete).toBe(false);
  });

  it("asks for what is missing instead of guessing", () => {
    expect(buildPricingPreview({ listing_mode: "per_bed", pricing, rooms: [], charges: [] })).toEqual({
      kind: "needs",
      message: "Add a room with its rent per bed to see the estimate.",
    });
    expect(buildPricingPreview({ listing_mode: "entire_unit", pricing, rooms: [], charges: [] }).kind).toBe("needs");
    expect(buildPricingPreview({ listing_mode: "entire_unit", pricing: { ...pricing, water_billing: null }, rooms: [], charges: [] }).kind).toBe("needs");
  });

  it("prices an entire unit from its monthly rent", () => {
    const preview = buildPricingPreview({
      listing_mode: "entire_unit",
      pricing: { ...pricing, monthly_rent: 25000, food_available: false },
      rooms: [],
      charges: [],
    });
    expect(preview.kind === "estimate" && preview.estimate.monthly_total).toBe(26300);
  });
});
