import { describe, expect, it } from "vitest";

import { availabilityQuerySchema, createStayBookingSchema, normalisePhone, stayGuestSchema, stayRequestSchema } from "./schemas";

const base = { listing: "sunrise-pg", rooms: [{ room_type: "double", qty: 1 }] };

describe("stay date fields", () => {
  it("rejects an impossible calendar day on that field (it used to roll over and blame check-out)", () => {
    const result = stayRequestSchema.safeParse({ ...base, checkin: "2027-02-30", checkout: "2027-03-02" });
    expect(result.success).toBe(false);
    const fields = result.error!.flatten().fieldErrors as Record<string, string[] | undefined>;
    expect(fields.checkin).toContain("Choose a real date.");
    expect(fields.checkout).toBeUndefined();
  });

  it("accepts real days, including 29 February in a leap year", () => {
    expect(stayRequestSchema.safeParse({ ...base, checkin: "2028-02-28", checkout: "2028-03-01" }).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ listing: "x", checkin: "2028-02-29", checkout: "2028-03-01" }).success).toBe(true);
    expect(availabilityQuerySchema.safeParse({ listing: "x", checkin: "2027-02-29", checkout: "2027-03-01" }).success).toBe(false);
  });
});

describe("guest phone", () => {
  it.each(["9876543210", "98765 43210", "+91 98765 43210", "09876543210", "91-98765-43210", " (98765) 43210 "])("normalises %j to 10 digits", (raw) => {
    expect(normalisePhone(raw)).toBe("9876543210");
    const parsed = stayGuestSchema.safeParse({ name: "Asha Rao", phone: raw, email: "a@b.com" });
    expect(parsed.success && parsed.data.phone).toBe("9876543210");
  });
  it.each(["12345 67890", "98765", "abc9876543210", "+1 98765 43210", "9876543210987", ""])("rejects %j", (raw) => {
    expect(stayGuestSchema.safeParse({ name: "Asha Rao", phone: raw, email: "a@b.com" }).success).toBe(false);
  });
});

describe("control characters", () => {
  const guest = { name: "Asha Rao", phone: "9876543210", email: "a@b.com" };
  const body = (over: Record<string, unknown>) => ({ stay: { ...base, checkin: "2027-01-10", checkout: "2027-01-12" }, guest, accept_policy: true, ...over });

  it("rejects control characters in the name", () => {
    for (const name of ["Asha\u0000Rao", "Asha\nRao", "Asha\tRao", "Asha\u001bRao", "Asha\u007fRao"]) {
      expect(stayGuestSchema.safeParse({ ...guest, name }).success).toBe(false);
    }
    expect(stayGuestSchema.safeParse({ ...guest, name: "Asha Rao" }).success).toBe(true);
  });
  it("keeps new lines in special requests but drops carriage returns and refuses other controls", () => {
    const ok = createStayBookingSchema.safeParse(body({ special_requests: "Lower bunk\r\nLate arrival\r" }));
    expect(ok.success && ok.data.special_requests).toBe("Lower bunk\nLate arrival");
    for (const special_requests of ["a\u0000b", "a\tb", "a\u001bb", "a\u007fb"]) {
      expect(createStayBookingSchema.safeParse(body({ special_requests })).success).toBe(false);
    }
  });
  it("accepts an optional expected total as a whole number only", () => {
    expect(createStayBookingSchema.safeParse(body({ expected_total_inr: 1890 })).success).toBe(true);
    expect(createStayBookingSchema.safeParse(body({ expected_total_inr: 18.5 })).success).toBe(false);
    expect(createStayBookingSchema.safeParse(body({ expected_total_inr: -1 })).success).toBe(false);
  });
});
