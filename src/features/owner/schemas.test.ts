import { describe, expect, it } from "vitest";

import {
  amenitiesSchema,
  basicsSchema,
  becomeOwnerSchema,
  chargesSchema,
  isOwnMediaPath,
  locationSchema,
  missingItemLabel,
  pricingSchema,
  registerMediaSchema,
  roomSchema,
  rulesSchema,
  rulesToRows,
  setListingStatusSchema,
  updateBedSchema,
} from "./schemas";

const PID = "0b9a1c7e-3f1d-4c55-9a51-2a8c7d6e5f40";
const OTHER = "6c1f2d3e-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
const FILE = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("becomeOwnerSchema", () => {
  it("normalises phone numbers and empties optional fields", () => {
    const out = becomeOwnerSchema.parse({
      owner_type: "pg_operator",
      business_name: "  ",
      contact_phone: "98765 43210",
      whatsapp_number: "",
      contact_email: "Owner@Example.com ",
    });
    expect(out).toEqual({
      owner_type: "pg_operator",
      business_name: null,
      contact_phone: "9876543210",
      whatsapp_number: null,
      contact_email: "owner@example.com",
    });
  });

  it("rejects an invalid phone and a one-letter business name", () => {
    const result = becomeOwnerSchema.safeParse({
      owner_type: "individual",
      business_name: "A",
      contact_phone: "12345",
      whatsapp_number: "",
      contact_email: "",
    });
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("contact_phone");
    expect(paths).toContain("business_name");
  });

  it("accepts an international number", () => {
    expect(becomeOwnerSchema.parse({ owner_type: "agent", business_name: "", contact_phone: "+919876543210", whatsapp_number: "+91 98765-43210", contact_email: "" }).whatsapp_number).toBe("+919876543210");
  });
});

describe("basicsSchema", () => {
  it("requires a title and maps an empty furnishing to null", () => {
    expect(basicsSchema.safeParse({ title: "ab", property_type: "pg", listing_mode: "per_bed", tenant_gender: "any", furnishing: "", description: "" }).success).toBe(false);
    const out = basicsSchema.parse({ title: " Sunny PG ", property_type: "pg", listing_mode: "per_bed", tenant_gender: "female", furnishing: "", description: "" });
    expect(out).toMatchObject({ title: "Sunny PG", furnishing: null, description: null });
  });

  it("rejects unknown enum values", () => {
    expect(basicsSchema.safeParse({ title: "Sunny PG", property_type: "castle", listing_mode: "per_bed", tenant_gender: "any", furnishing: "", description: "" }).success).toBe(false);
  });
});

describe("locationSchema", () => {
  const base = { property_id: PID, address_line: "12 MG Road", locality: "Indiranagar", city: "Bengaluru", state: "", pincode: "", landmark: "" };

  it("accepts an address without a pin and with a pin inside India", () => {
    expect(locationSchema.parse({ ...base, lat: null, lng: null }).lat).toBeNull();
    expect(locationSchema.parse({ ...base, lat: 12.97, lng: 77.64, pincode: "560038" }).pincode).toBe("560038");
  });

  it("rejects half a pin, a pin outside India and a bad PIN code", () => {
    expect(locationSchema.safeParse({ ...base, lat: 12.97, lng: null }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, lat: 51.5, lng: -0.12 }).success).toBe(false);
    expect(locationSchema.safeParse({ ...base, lat: null, lng: null, pincode: "012345" }).success).toBe(false);
  });
});

describe("pricingSchema", () => {
  const base = {
    property_id: PID,
    monthly_rent: "",
    security_deposit: "",
    maintenance_monthly: "500",
    electricity_billing: "included" as const,
    electricity_monthly_estimate: "900",
    water_billing: "metered" as const,
    water_monthly_estimate: "200",
    food_available: false,
    food_included: true,
    food_monthly_charge: "3000",
    meals_breakfast: true,
    meals_lunch: false,
    meals_dinner: false,
  };

  it("coerces money and drops amounts that do not apply", () => {
    const out = pricingSchema.parse(base);
    expect(out.monthly_rent).toBeNull();
    expect(out.maintenance_monthly).toBe(500);
    expect(out.electricity_monthly_estimate).toBeNull();
    expect(out.water_monthly_estimate).toBe(200);
    expect(out.food_included).toBe(false);
    expect(out.food_monthly_charge).toBeNull();
    expect(out.meals_breakfast).toBe(false);
  });

  it("keeps the food charge only when food is available and not included", () => {
    expect(pricingSchema.parse({ ...base, food_available: true, food_included: false }).food_monthly_charge).toBe(3000);
    expect(pricingSchema.parse({ ...base, food_available: true, food_included: true }).food_monthly_charge).toBeNull();
  });

  it("rejects paise and negative amounts", () => {
    expect(pricingSchema.safeParse({ ...base, maintenance_monthly: "99.5" }).success).toBe(false);
    expect(pricingSchema.safeParse({ ...base, maintenance_monthly: "-1" }).success).toBe(false);
  });
});

describe("roomSchema / updateBedSchema", () => {
  it("validates capacity and rent", () => {
    const room = { property_id: PID, name: "Room 101", room_type: "shared", capacity: "2", rent_per_bed: "8000", security_deposit: "", has_attached_bathroom: true, has_ac: false, has_balcony: false, floor: "", description: "" };
    expect(roomSchema.parse(room)).toMatchObject({ capacity: 2, rent_per_bed: 8000, security_deposit: null, floor: null });
    expect(roomSchema.safeParse({ ...room, capacity: "13" }).success).toBe(false);
    expect(roomSchema.safeParse({ ...room, rent_per_bed: "" }).success).toBe(false);
  });

  it("validates bed updates", () => {
    expect(updateBedSchema.parse({ bed_id: PID, status: "occupied", available_from: "", rent_override: "" })).toEqual({ bed_id: PID, status: "occupied", available_from: null, rent_override: null });
    expect(updateBedSchema.parse({ bed_id: PID, status: "available", available_from: "2026-12-01", rent_override: "7500" }).rent_override).toBe(7500);
    expect(updateBedSchema.safeParse({ bed_id: PID, status: "gone", available_from: "", rent_override: "" }).success).toBe(false);
    expect(updateBedSchema.safeParse({ bed_id: PID, status: "available", available_from: "1999-01-01", rent_override: "" }).success).toBe(false);
  });
});

describe("amenities, rules, charges", () => {
  it("de-duplicates and sorts amenity codes", () => {
    expect(amenitiesSchema.parse({ property_id: PID, amenity_codes: ["wifi", "ac", "wifi"] }).amenity_codes).toEqual(["ac", "wifi"]);
    expect(amenitiesSchema.safeParse({ property_id: PID, amenity_codes: ["DROP TABLE"] }).success).toBe(false);
  });

  it("turns the rules form into rows, skipping unset rules", () => {
    const parsed = rulesSchema.parse({
      property_id: PID,
      choices: { smoking: "not_allowed", pets: "allowed", visitors: "unset" },
      gate_closing_time: "22:30",
      notes: "",
    });
    expect(rulesToRows(parsed)).toEqual([
      { rule_code: "smoking", allowed: false, value: null, note: null },
      { rule_code: "pets", allowed: true, value: null, note: null },
      { rule_code: "gate_closing_time", allowed: null, value: "22:30", note: null },
    ]);
    expect(rulesSchema.safeParse({ property_id: PID, choices: {}, gate_closing_time: "25:00", notes: "" }).success).toBe(false);
  });

  it("validates extra charges", () => {
    expect(chargesSchema.parse({ property_id: PID, charges: [{ label: "Laundry", amount: "300", frequency: "monthly", is_mandatory: true }] }).charges[0]!.amount).toBe(300);
    expect(chargesSchema.safeParse({ property_id: PID, charges: [{ label: "x", amount: "300", frequency: "monthly", is_mandatory: true }] }).success).toBe(false);
  });
});

describe("media and status", () => {
  it("accepts only <property_id>/<uuid>.webp paths of the same listing", () => {
    expect(isOwnMediaPath(PID, `${PID}/${FILE}.webp`)).toBe(true);
    expect(isOwnMediaPath(PID, `${OTHER}/${FILE}.webp`)).toBe(false);
    expect(isOwnMediaPath(PID, `${PID}/../${FILE}.webp`)).toBe(false);
    expect(isOwnMediaPath(PID, `${PID}/${FILE}.png`)).toBe(false);
    const media = { property_id: PID, storage_path: `${OTHER}/${FILE}.webp`, width: 100, height: 100, size_bytes: 1000 };
    expect(registerMediaSchema.safeParse(media).success).toBe(false);
    expect(registerMediaSchema.safeParse({ ...media, storage_path: `${PID}/${FILE}.webp` }).success).toBe(true);
    expect(registerMediaSchema.safeParse({ ...media, storage_path: `${PID}/${FILE}.webp`, size_bytes: 9 * 1024 * 1024 }).success).toBe(false);
  });

  it("lets owners set only published, paused or archived", () => {
    expect(setListingStatusSchema.safeParse({ property_id: PID, status: "paused" }).success).toBe(true);
    expect(setListingStatusSchema.safeParse({ property_id: PID, status: "pending_review" }).success).toBe(false);
  });

  it("labels missing items", () => {
    expect(missingItemLabel("map_pin")).toBe("A pin on the map");
    expect(missingItemLabel("something_new")).toBe("something new");
  });
});
