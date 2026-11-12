import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatDistance,
  formatINR,
  formatINRCompact,
  formatINRRange,
  formatNumber,
  formatRelativeTime,
  initials,
  pluralize,
} from "./format";

describe("formatINR", () => {
  it("uses Indian digit grouping and no decimals", () => {
    expect(formatINR(125000)).toBe("₹1,25,000");
    expect(formatINR(8500)).toBe("₹8,500");
    expect(formatINR(0)).toBe("₹0");
    expect(formatINR(12345678)).toBe("₹1,23,45,678");
  });

  it("rounds fractional rupees", () => {
    expect(formatINR(999.6)).toBe("₹1,000");
  });

  it("returns a dash for missing or invalid amounts", () => {
    expect(formatINR(null)).toBe("—");
    expect(formatINR(undefined)).toBe("—");
    expect(formatINR(Number.NaN)).toBe("—");
    expect(formatINR(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatINRCompact", () => {
  it("abbreviates thousands, lakhs and crores", () => {
    expect(formatINRCompact(8000)).toBe("₹8k");
    expect(formatINRCompact(12500)).toBe("₹12.5k");
    expect(formatINRCompact(150000)).toBe("₹1.5L");
    expect(formatINRCompact(100000)).toBe("₹1L");
    expect(formatINRCompact(12000000)).toBe("₹1.2Cr");
  });

  it("keeps small amounts whole and handles negatives", () => {
    expect(formatINRCompact(750)).toBe("₹750");
    expect(formatINRCompact(-2500)).toBe("-₹2.5k");
    expect(formatINRCompact(null)).toBe("—");
  });
});

describe("formatINRRange", () => {
  it("formats every combination of bounds", () => {
    expect(formatINRRange(8000, 15000)).toBe("₹8,000 – ₹15,000");
    expect(formatINRRange(8000, 8000)).toBe("₹8,000");
    expect(formatINRRange(8000, null)).toBe("From ₹8,000");
    expect(formatINRRange(undefined, 15000)).toBe("Up to ₹15,000");
    expect(formatINRRange(null, null)).toBe("—");
  });
});

describe("formatNumber and pluralize", () => {
  it("groups the Indian way", () => {
    expect(formatNumber(1234567)).toBe("12,34,567");
    expect(formatNumber(null)).toBe("—");
  });

  it("picks singular or plural", () => {
    expect(pluralize(1, "bed")).toBe("1 bed");
    expect(pluralize(3, "bed")).toBe("3 beds");
    expect(pluralize(0, "enquiry", "enquiries")).toBe("0 enquiries");
  });
});

describe("formatDistance", () => {
  it("uses metres below 1 km and kilometres above", () => {
    expect(formatDistance(854)).toBe("850 m");
    expect(formatDistance(1240)).toBe("1.2 km");
    expect(formatDistance(3000)).toBe("3 km");
    expect(formatDistance(12400)).toBe("12 km");
  });

  it("rejects invalid input", () => {
    expect(formatDistance(-5)).toBe("—");
    expect(formatDistance(null)).toBe("—");
  });
});

describe("formatDate", () => {
  it("formats in India time regardless of the host time zone", () => {
    // 20:00 UTC on 10 Nov is 01:30 on 11 Nov in India.
    expect(formatDate("2026-11-10T20:00:00Z")).toBe("11 Nov 2026");
  });

  it("includes the time in formatDateTime", () => {
    expect(formatDateTime("2026-11-11T10:35:00Z")).toMatch(
      /^11 Nov 2026, 4:05\s?pm$/i,
    );
  });

  it("returns a dash for missing or invalid dates", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-11-11T12:00:00Z");

  it("describes past and future moments", () => {
    expect(formatRelativeTime("2026-11-11T11:59:40Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-11-11T11:30:00Z", now)).toBe(
      "30 minutes ago",
    );
    expect(formatRelativeTime("2026-11-11T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-11-10T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelativeTime("2026-11-08T12:00:00Z", now)).toBe("3 days ago");
    expect(formatRelativeTime("2026-11-11T14:00:00Z", now)).toBe("in 2 hours");
  });

  it("returns a dash for invalid input", () => {
    expect(formatRelativeTime(undefined, now)).toBe("—");
  });
});

describe("initials", () => {
  it("takes the first and last name initials", () => {
    expect(initials("Asha Rao")).toBe("AR");
    expect(initials("  asha   kumari rao ")).toBe("AR");
    expect(initials("zuvio")).toBe("Z");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });
});
