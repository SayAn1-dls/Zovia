import { describe, expect, it } from "vitest";

import type { StayBooking } from "../schemas";
import { buildStayIcs, foldIcsLine, icsText } from "./stay-text";

const booking = (over: Partial<StayBooking> = {}) =>
  ({
    id: "6b2f2d4e-0000-4000-8000-000000000001",
    listing_title: "Sunrise PG",
    locality: "Koramangala",
    city: "Bengaluru",
    checkin: "2026-12-10",
    checkout: "2026-12-12",
    lines: [],
    grand_total_inr: 630,
    tax_percent: 5,
    guest_name: "Asha Rao",
    ...over,
  }) as StayBooking;

describe("calendar file text", () => {
  it("escapes backslashes, commas, semicolons and every kind of line break", () => {
    expect(icsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    expect(icsText("one\r\nTwo\rThree\nFour")).toBe("one\\nTwo\\nThree\\nFour");
  });

  it("a hostile title cannot inject a new property (\\r alone or \\r\\n)", () => {
    const ics = buildStayIcs(booking({ listing_title: "X\r\nATTENDEE:mailto:evil@x.com\rBEGIN:VALARM" }), "https://zovia.test/b", new Date("2026-11-19T00:00:00Z"));
    const lines = ics.split("\r\n").flatMap((line) => line.split("\n"));
    expect(lines.some((line) => line.startsWith("ATTENDEE"))).toBe(false);
    expect(lines.some((line) => line.startsWith("BEGIN:VALARM"))).toBe(false);
    expect(ics).not.toMatch(/\r(?!\n)/);
  });

  it("folds long lines at 75 octets and never splits a character", () => {
    const folded = foldIcsLine(`SUMMARY:${"é".repeat(60)}`);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    expect(enc.encode(parts[0]!).length).toBeLessThanOrEqual(75);
    for (const part of parts.slice(1)) {
      expect(part.startsWith(" ")).toBe(true);
      expect(enc.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(parts.map((part, index) => (index ? part.slice(1) : part)).join("")).toBe(`SUMMARY:${"é".repeat(60)}`);
    expect(foldIcsLine("SHORT:line")).toBe("SHORT:line");
  });

  it("folds every line of a real file", () => {
    const ics = buildStayIcs(booking({ listing_title: "A very long place name ".repeat(8) }), "https://zovia.test/bookings/x", new Date("2026-11-19T00:00:00Z"));
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
