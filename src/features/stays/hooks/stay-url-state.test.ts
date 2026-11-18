import { describe, expect, it } from "vitest";

import { addDays, indiaToday } from "./stay-dates";
import {
  bookHref,
  bookNowTarget,
  datesNoticeText,
  datesWereAdjusted,
  maxQtyFor,
  normaliseDates,
  parseRooms,
  serializeRooms,
  setRoomQty,
} from "./stay-url-state";

describe("rooms in the URL", () => {
  it("decodes single@1,double@2", () => {
    expect(parseRooms("single@1,double@2")).toEqual([
      { room_type: "single", qty: 1 },
      { room_type: "double", qty: 2 },
    ]);
  });

  it("drops unknown types, bad numbers and repeats", () => {
    expect(parseRooms("suite@2,single@x,double@0,triple@-1,double@3,double@1")).toEqual([{ room_type: "double", qty: 3 }]);
    expect(parseRooms("")).toEqual([]);
    expect(parseRooms(null)).toEqual([]);
    expect(parseRooms("single@1.5")).toEqual([]);
  });

  it("caps the total at 8 beds", () => {
    expect(parseRooms("single@5,double@5,triple@2")).toEqual([
      { room_type: "single", qty: 5 },
      { room_type: "double", qty: 3 },
    ]);
    expect(parseRooms("triple@20")).toEqual([{ room_type: "triple", qty: 8 }]);
  });

  it("encodes in a fixed type order and removes the parameter when empty", () => {
    expect(serializeRooms([{ room_type: "triple", qty: 1 }, { room_type: "single", qty: 2 }])).toBe("single@2,triple@1");
    expect(serializeRooms([])).toBeNull();
  });

  it("round-trips", () => {
    const raw = "single@1,double@2,triple@3";
    expect(serializeRooms(parseRooms(raw))).toBe(raw);
  });
});

describe("dates", () => {
  const today = "2026-11-19";

  it("defaults to tomorrow for one night", () => {
    expect(normaliseDates({}, today)).toEqual({ checkin: "2026-11-20", checkout: "2026-11-21", nights: 1 });
  });

  it("keeps valid dates", () => {
    expect(normaliseDates({ checkin: "2026-11-25", checkout: "2026-11-28" }, today)).toEqual({ checkin: "2026-11-25", checkout: "2026-11-28", nights: 3 });
  });

  it("refuses past, malformed and far-off check-in dates", () => {
    expect(normaliseDates({ checkin: "2026-11-18" }, today).checkin).toBe("2026-11-20");
    expect(normaliseDates({ checkin: "2026-02-31" }, today).checkin).toBe("2026-11-20");
    expect(normaliseDates({ checkin: addDays(today, 400) }, today).checkin).toBe("2026-11-20");
  });

  it("puts check-out after check-in and at most 30 nights on", () => {
    expect(normaliseDates({ checkin: "2026-11-25", checkout: "2026-11-25" }, today).checkout).toBe("2026-11-26");
    expect(normaliseDates({ checkin: "2026-11-25", checkout: "2027-02-01" }, today)).toMatchObject({ checkout: "2026-12-25", nights: 30 });
  });

  it("allows check-in on the last day of the 365-day window, and refuses the day after", () => {
    const last = addDays(today, 365);
    expect(normaliseDates({ checkin: last }, today)).toMatchObject({ checkin: last, checkout: addDays(last, 1) });
    expect(normaliseDates({ checkin: addDays(today, 366) }, today).checkin).toBe("2026-11-20");
  });

  it("tells when a link's dates were replaced, not when a missing date was defaulted", () => {
    const adjusted = (raw: { checkin?: string; checkout?: string }) => datesWereAdjusted(raw, normaliseDates(raw, today));
    expect(adjusted({ checkin: "2026-11-18", checkout: "2026-11-20" })).toBe(true);
    expect(adjusted({ checkin: "2026-02-31" })).toBe(true);
    expect(adjusted({ checkin: "2026-11-25", checkout: "2027-02-01" })).toBe(true);
    expect(adjusted({ checkin: "2026-11-25", checkout: "2026-11-28" })).toBe(false);
    expect(adjusted({ checkin: "2026-11-25" })).toBe(false);
    expect(adjusted({})).toBe(false);
    expect(datesNoticeText(normaliseDates({ checkin: "2026-11-18" }, today))).toBe("Your dates were updated to Fri, 20 Nov to Sat, 21 Nov.");
  });

  it("reads today in India time", () => {
    // 20:00 UTC on the 19th is already the 20th in India.
    expect(indiaToday(Date.parse("2026-11-19T20:00:00Z"))).toBe("2026-11-20");
  });
});

describe("stepper limits", () => {
  it("is limited by units left", () => {
    expect(maxQtyFor("double", [], 3)).toBe(3);
  });

  it("is limited by 8 beds across types", () => {
    const rooms = [{ room_type: "single" as const, qty: 6 }];
    expect(maxQtyFor("double", rooms, 5)).toBe(2);
    expect(maxQtyFor("single", rooms, 10)).toBe(8);
  });

  it("removes a type at 0 and clamps to the maximum", () => {
    const rooms = [{ room_type: "single" as const, qty: 1 }];
    expect(setRoomQty(rooms, "single", 0, 4)).toEqual([]);
    expect(setRoomQty(rooms, "double", 9, 4)).toEqual([...rooms, { room_type: "double", qty: 4 }]);
  });
});

describe("Book now target", () => {
  const href = bookHref("sunrise-pg-koramangala", { checkin: "2026-11-20", checkout: "2026-11-22", rooms: [{ room_type: "double", qty: 2 }] });

  it("builds the /book URL with the selection", () => {
    expect(href).toBe("/book/sunrise-pg-koramangala?checkin=2026-11-20&checkout=2026-11-22&rooms=double%402");
  });

  it("sends signed-out guests to sign-in and back to /book", () => {
    const target = bookNowTarget(href, false);
    const url = new URL(target, "http://zovia.test");
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe(href);
  });

  it("goes straight to /book when signed in", () => {
    expect(bookNowTarget(href, true)).toBe(href);
  });
});
