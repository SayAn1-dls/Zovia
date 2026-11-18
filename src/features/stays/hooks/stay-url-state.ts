import type { Route } from "next";
import { createParser, parseAsString, useQueryStates } from "nuqs";
import { useCallback, useMemo, useState } from "react";

import { dynamicRoutes, routes, withQuery } from "@/lib/navigation";

import { STAY_ROOM_TYPES, STAY_RULES, nightsBetween, type RoomSelection, type StayRoomType } from "../schemas";
import { addDays, indiaToday } from "./stay-dates";
import { formatStayDate } from "./stay-text";

/**
 * Stay selection in the URL, as Zostel does it: `?checkin=YYYY-MM-DD&checkout=YYYY-MM-DD&rooms=single@1,double@2`.
 * The URL is the only state, so a link can be shared and a reload keeps the cart. Everything here is
 * a convenience for the screen; the server re-checks dates, rooms and prices on every quote.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value;
}

/** "single@1,double@2" -> rooms. Unknown types, bad numbers and repeats are dropped; quantities are clamped. */
export function parseRooms(raw: string | null | undefined): RoomSelection[] {
  if (!raw) return [];
  const seen = new Set<StayRoomType>();
  const rooms: RoomSelection[] = [];
  let total = 0;
  for (const part of raw.split(",")) {
    const [type, qtyText] = part.trim().split("@");
    if (!type || !(STAY_ROOM_TYPES as readonly string[]).includes(type)) continue;
    const roomType = type as StayRoomType;
    if (seen.has(roomType)) continue;
    const qty = Number(qtyText);
    if (!Number.isInteger(qty) || qty < 1) continue;
    const allowed = Math.min(qty, STAY_RULES.max_units - total);
    if (allowed < 1) break;
    seen.add(roomType);
    rooms.push({ room_type: roomType, qty: allowed });
    total += allowed;
  }
  return rooms;
}

/** rooms -> "single@1,double@2" in a fixed type order; null when empty (the parameter is removed). */
export function serializeRooms(rooms: readonly RoomSelection[]): string | null {
  const parts = STAY_ROOM_TYPES.flatMap((type) => {
    const room = rooms.find((candidate) => candidate.room_type === type);
    return room && room.qty > 0 ? [`${type}@${room.qty}`] : [];
  });
  return parts.length > 0 ? parts.join(",") : null;
}

export const roomsParser = createParser<RoomSelection[]>({
  parse: (value) => {
    const rooms = parseRooms(value);
    return rooms.length > 0 ? rooms : null;
  },
  serialize: (rooms) => serializeRooms(rooms) ?? "",
  eq: (a, b) => serializeRooms(a) === serializeRooms(b),
});

export type StayDates = { checkin: string; checkout: string; nights: number };

/**
 * Valid dates from whatever the URL holds: check-in from today (India) to a year ahead (default
 * tomorrow), check-out after check-in and at most 30 nights later (default one night).
 */
export function normaliseDates(input: { checkin?: string | null; checkout?: string | null }, today = indiaToday()): StayDates {
  const latest = addDays(today, STAY_RULES.max_days_ahead);
  const checkin = isIsoDate(input.checkin) && input.checkin >= today && input.checkin <= latest ? input.checkin : addDays(today, 1);
  let checkout = isIsoDate(input.checkout) ? input.checkout : addDays(checkin, 1);
  const nights = nightsBetween(checkin, checkout);
  if (nights < STAY_RULES.min_nights) checkout = addDays(checkin, 1);
  else if (nights > STAY_RULES.max_nights) checkout = addDays(checkin, STAY_RULES.max_nights);
  return { checkin, checkout, nights: nightsBetween(checkin, checkout) };
}

/**
 * True when the URL held dates that were replaced (past, malformed, out of range or too long a
 * stay). A missing date that was simply defaulted does not count.
 */
export function datesWereAdjusted(raw: { checkin?: string | null; checkout?: string | null }, dates: StayDates): boolean {
  return (Boolean(raw.checkin) && raw.checkin !== dates.checkin) || (Boolean(raw.checkout) && raw.checkout !== dates.checkout);
}

/** The sentence shown when a shared link's dates were replaced. */
export function datesNoticeText(dates: StayDates): string {
  return `Your dates were updated to ${formatStayDate(dates.checkin)} to ${formatStayDate(dates.checkout)}.`;
}

export type StaySelection = StayDates & { rooms: RoomSelection[]; units: number };

/** Total beds across room types. */
export function unitsOf(rooms: readonly RoomSelection[]): number {
  return rooms.reduce((sum, room) => sum + room.qty, 0);
}

/** Most beds the stepper may add for one type: free units for the dates and the 8-bed cap across types. */
export function maxQtyFor(roomType: StayRoomType, rooms: readonly RoomSelection[], unitsLeft: number): number {
  const others = unitsOf(rooms.filter((room) => room.room_type !== roomType));
  return Math.max(0, Math.min(unitsLeft, STAY_RULES.max_units - others));
}

/** Sets one type's quantity (0 removes it), clamped to `max`. */
export function setRoomQty(rooms: readonly RoomSelection[], roomType: StayRoomType, qty: number, max: number): RoomSelection[] {
  const next = Math.max(0, Math.min(Math.floor(qty), max));
  const rest = rooms.filter((room) => room.room_type !== roomType);
  return next > 0 ? [...rest, { room_type: roomType, qty: next }] : rest;
}

/** Query string for a selection, in the shape the listing page and /book read. */
export function selectionQuery(selection: { checkin: string; checkout: string; rooms: readonly RoomSelection[] }) {
  return { checkin: selection.checkin, checkout: selection.checkout, rooms: serializeRooms(selection.rooms) };
}

export function bookHref(slug: string, selection: { checkin: string; checkout: string; rooms: readonly RoomSelection[] }): Route {
  return withQuery(dynamicRoutes.book(slug), selectionQuery(selection));
}

export function listingHref(slug: string, selection: { checkin: string; checkout: string; rooms: readonly RoomSelection[] }): Route {
  return withQuery(dynamicRoutes.property(slug), selectionQuery(selection));
}

/** Where "Book now" goes: the booking page, or sign-in first and back to it after. */
export function bookNowTarget(bookUrl: string, signedIn: boolean): Route {
  return signedIn ? (bookUrl as Route) : withQuery(routes.signIn, { next: bookUrl });
}

const parsers = {
  checkin: parseAsString,
  checkout: parseAsString,
  rooms: roomsParser,
};

/** The listing / checkout selection, read from and written to the URL (replace, no scroll, no server round trip). */
export function useStaySelection() {
  const [raw, setRaw] = useQueryStates(parsers, { history: "replace", scroll: false, shallow: true });
  const [dismissed, setDismissed] = useState<string | null>(null);
  const selection: StaySelection = useMemo(() => {
    const dates = normaliseDates(raw);
    const rooms = raw.rooms ?? [];
    return { ...dates, rooms, units: unitsOf(rooms) };
  }, [raw]);
  // Dates in a shared link that had to be replaced are announced once (until dismissed).
  const noticeKey = `${raw.checkin ?? ""}|${raw.checkout ?? ""}`;
  const datesNotice = datesWereAdjusted(raw, selection) && dismissed !== noticeKey ? datesNoticeText(selection) : null;
  const dismissDatesNotice = useCallback(() => setDismissed(noticeKey), [noticeKey]);

  const update = useCallback(
    (patch: Partial<{ checkin: string; checkout: string; rooms: RoomSelection[] }>) => {
      const dates = normaliseDates({ checkin: patch.checkin ?? selection.checkin, checkout: patch.checkout ?? selection.checkout });
      const rooms = patch.rooms ?? selection.rooms;
      void setRaw({ checkin: dates.checkin, checkout: dates.checkout, rooms: rooms.length > 0 ? rooms : null });
    },
    [selection, setRaw],
  );

  return { selection, update, datesNotice, dismissDatesNotice };
}
