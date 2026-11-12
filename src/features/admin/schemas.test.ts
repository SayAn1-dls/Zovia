import { describe, expect, it } from "vitest";

import { parseAdminAnalytics } from "./schemas";

describe("parseAdminAnalytics", () => {
  it("fills missing statuses with 0, drops unknown keys and trims day timestamps", () => {
    const result = parseAdminAnalytics({
      generated_at: "2026-11-13T10:00:00Z",
      users_total: 12,
      users_new_today: 1,
      users_new_7d: 4,
      users_new_30d: 9,
      signups_by_day: [{ day: "2026-11-12T00:00:00+00:00", count: 3 }],
      owners: 2,
      listings_by_status: { published: 5, bogus: 7 },
      bookings_by_status: { confirmed: 1 },
      roommate_profiles: 3,
      roommate_profiles_active: 2,
      matches: 1,
      messages_7d: 10,
      contact_messages_new: 0,
      ai_calls_7d: 6,
    });
    expect(result.listings_by_status).toEqual({ draft: 0, pending_review: 0, published: 5, paused: 0, rejected: 0, archived: 0 });
    expect(result.bookings_by_status.confirmed).toBe(1);
    expect(result.bookings_by_status.requested).toBe(0);
    expect(result.signups_by_day).toEqual([{ day: "2026-11-12", count: 3 }]);
  });

  it("treats malformed counts as 0 rather than inventing numbers", () => {
    const result = parseAdminAnalytics({ generated_at: "2026-11-13T10:00:00Z", users_total: "lots", matches: -1 });
    expect(result.users_total).toBe(0);
    expect(result.matches).toBe(0);
    expect(result.signups_by_day).toEqual([]);
  });

  it("rejects a payload without generated_at", () => {
    expect(() => parseAdminAnalytics({})).toThrow();
  });
});
