import { describe, expect, it } from "vitest";

import { priceStay, taxOn, unitPricePerNight } from "./pricing";

const one = (rent: number, units: number, nights: number) =>
  priceStay({ nights, rooms: [{ room_type: "double", units, rent_per_month_inr: rent }] });

describe("price vectors from docs/stay-booking.md", () => {
  it.each([
    [9000, 2, 3, 300, 1800, 5, 90, 1890],
    [6500, 1, 1, 217, 217, 5, 11, 228],
    [12000, 3, 2, 400, 2400, 5, 120, 2520],
    [250000, 1, 2, 8334, 16668, 18, 3000, 19668],
  ])("rent %i x %i units x %i nights", (rent, units, nights, unit, stay, pct, tax, grand) => {
    const price = one(rent, units, nights);
    expect(price.lines[0]!.unit_price_inr).toBe(unit);
    expect(price.stay_total_inr).toBe(stay);
    expect(price.tax_percent).toBe(pct);
    expect(price.tax_inr).toBe(tax);
    expect(price.grand_total_inr).toBe(grand);
    expect(price.payable_now_inr).toBe(grand);
  });
});

describe("mixed types", () => {
  it("uses one tax rate from the highest unit price and rounds tax once", () => {
    const price = priceStay({
      nights: 2,
      rooms: [
        { room_type: "triple", units: 1, rent_per_month_inr: 6000 },
        { room_type: "single", units: 1, rent_per_month_inr: 240000 },
      ],
    });
    expect(price.lines.map((l) => l.unit_price_inr)).toEqual([200, 8000]);
    expect(price.stay_total_inr).toBe(400 + 16000);
    expect(price.tax_percent).toBe(18);
    expect(price.tax_inr).toBe(2952);
  });
  it("threshold is inclusive: 7,500 a night stays at 5%", () => {
    expect(one(225000, 1, 1).tax_percent).toBe(5);
    expect(one(225001, 1, 1).tax_percent).toBe(18);
  });
});

describe("rounding and validation", () => {
  it("rounds half up", () => {
    expect(taxOn(10, 5)).toBe(1); // 0.5 -> 1
    expect(taxOn(9, 5)).toBe(0); // 0.45 -> 0
    expect(taxOn(30, 5)).toBe(2); // 1.5 -> 2
  });
  it("rejects invalid input", () => {
    expect(() => unitPricePerNight(0)).toThrow(RangeError);
    expect(() => unitPricePerNight(100.5)).toThrow(RangeError);
    expect(() => unitPricePerNight(Number.NaN)).toThrow(RangeError);
    expect(() => one(9000, 0, 1)).toThrow(RangeError);
    expect(() => one(9000, 1.5, 1)).toThrow(RangeError);
    expect(() => one(9000, 1, 0)).toThrow(RangeError);
    expect(() => one(9000, 1, 31)).toThrow(RangeError);
    expect(() => one(9000, 9, 1)).toThrow(RangeError);
    expect(() => priceStay({ nights: 1, rooms: [] })).toThrow(RangeError);
  });
});
