import { describe, expect, it } from "vitest";

import { normaliseWhatsAppNumber, site } from "./site";

describe("normaliseWhatsAppNumber", () => {
  it("adds India's country code to a bare Indian mobile number", () => {
    expect(normaliseWhatsAppNumber("8918596845")).toBe("918918596845");
    expect(normaliseWhatsAppNumber("89185 96845")).toBe("918918596845");
    expect(normaliseWhatsAppNumber("08918596845")).toBe("918918596845");
  });

  it("keeps a number that already has its country code", () => {
    expect(normaliseWhatsAppNumber("918918596845")).toBe("918918596845");
    expect(normaliseWhatsAppNumber("+91 89185 96845")).toBe("918918596845");
    expect(normaliseWhatsAppNumber("0091 89185 96845")).toBe("918918596845");
  });

  it("leaves other countries' numbers as typed", () => {
    expect(normaliseWhatsAppNumber("+1 (415) 555-0132")).toBe("14155550132");
    expect(normaliseWhatsAppNumber("447911123456")).toBe("447911123456");
  });

  it("returns null for nothing or for too few digits", () => {
    expect(normaliseWhatsAppNumber(undefined)).toBeNull();
    expect(normaliseWhatsAppNumber("")).toBeNull();
    expect(normaliseWhatsAppNumber("12345")).toBeNull();
  });
});

describe("site.supportEmail", () => {
  it("is always present so visitors can write directly", () => {
    expect(site.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
