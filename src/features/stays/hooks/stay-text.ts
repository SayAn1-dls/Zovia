import { formatINR } from "@/lib/format";

import { STAY_RULES, type StayBooking, type StayQuoteLine } from "../schemas";
import { addDays } from "./stay-dates";

/** Text helpers for stay screens: dates, the shareable summary, the calendar file. Pure. */

const shortDate = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: "UTC" });
const dayNumber = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function asDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "2026-11-20" -> "Fri, 20 Nov" (or with the year). */
export function formatStayDate(iso: string, withYear = false): string {
  return (withYear ? longDate : shortDate).format(asDate(iso));
}

export function formatWeekday(iso: string): string {
  return dayOnly.format(asDate(iso));
}

export function formatDayMonth(iso: string): string {
  return dayNumber.format(asDate(iso));
}

export function nightsLabel(nights: number): string {
  return `${nights} ${nights === 1 ? "night" : "nights"}`;
}

export function bedsLabel(units: number): string {
  return `${units} ${units === 1 ? "bed" : "beds"}`;
}

/** "13:00" -> "1 PM", "10:00" -> "10 AM". */
export function formatClock(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes ? `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}` : `${hour12} ${suffix}`;
}

/** India is UTC+5:30 all year: a wall-clock time on a date as an ISO instant. */
export function indiaInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

/** Last moment a cancellation is still refunded in full (check-in day minus 7, at check-in time). */
export function freeCancelDeadline(checkin: string): string {
  return indiaInstant(addDays(checkin, -STAY_RULES.free_cancel_days), STAY_RULES.check_in_time);
}

export function lineTitle(line: Pick<StayQuoteLine, "label" | "units">): string {
  return `${line.label} × ${line.units}`;
}

export function lineMath(line: Pick<StayQuoteLine, "unit_price_inr" | "nights">): string {
  return `${formatINR(line.unit_price_inr)} × ${nightsLabel(line.nights)}`;
}

/** Plain-text booking summary for WhatsApp and the share sheet. */
export function bookingSummaryText(booking: StayBooking, url: string): string {
  return [
    `Zovia stay booking (${booking.id.slice(0, 8).toUpperCase()})`,
    `${booking.listing_title}, ${booking.locality}, ${booking.city}`,
    `Check-in ${formatStayDate(booking.checkin, true)}, ${formatClock(STAY_RULES.check_in_time)}`,
    `Check-out ${formatStayDate(booking.checkout, true)}, ${formatClock(STAY_RULES.check_out_time)}`,
    ...booking.lines.map((line) => `${lineTitle(line)}: ${formatINR(line.line_total_inr)}`),
    `Total ${formatINR(booking.grand_total_inr)} (incl. ${booking.tax_percent}% tax)`,
    `Guest: ${booking.guest_name}`,
    url,
  ].join("\n");
}

/** RFC 5545 TEXT: escapes \\ , ; and turns every line break (\r\n, \r, \n) into \n, so no value can start a new property. */
export function icsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ")
    .replace(/([,;])/g, "\\$1");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets (RFC 5545 3.1): continuation lines start with one space; never splits a character. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
      limit = 74; // the leading space takes one octet
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** An iCalendar file for the stay (check-in 1 PM to check-out 10 AM, India time). */
export function buildStayIcs(booking: StayBooking, url: string, now: Date = new Date()): string {
  const place = `${booking.listing_title}, ${booking.locality}, ${booking.city}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Zovia//Stay booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.id}@zovia`,
    `DTSTAMP:${icsStamp(now.toISOString())}`,
    `DTSTART:${icsStamp(indiaInstant(booking.checkin, STAY_RULES.check_in_time))}`,
    `DTEND:${icsStamp(indiaInstant(booking.checkout, STAY_RULES.check_out_time))}`,
    `SUMMARY:${icsText(`Stay at ${booking.listing_title}`)}`,
    `LOCATION:${icsText(place)}`,
    `DESCRIPTION:${icsText(bookingSummaryText(booking, url))}`,
    `URL:${url.replace(/[\u0000-\u001f\u007f\s]/g, "")}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(foldIcsLine)
    .join("\r\n");
}
