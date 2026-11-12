/**
 * Formatting helpers shared by every feature. Pure and isomorphic.
 * Money is integer INR end to end (spec section 4).
 */

const LOCALE = "en-IN";
const TIME_ZONE = "Asia/Kolkata";

const inrFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat(LOCALE, {
  maximumFractionDigits: 0,
});

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 125000 -> "₹1,25,000" (Indian digit grouping). Null/invalid -> "—". */
export function formatINR(amount: number | null | undefined): string {
  if (!isFiniteNumber(amount)) return "—";
  return inrFormatter.format(Math.round(amount));
}

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

/**
 * Short money for chips and filters: 8000 -> "₹8k", 12500 -> "₹12.5k",
 * 150000 -> "₹1.5L", 12000000 -> "₹1.2Cr". Below 1,000 the full amount is shown.
 */
export function formatINRCompact(amount: number | null | undefined): string {
  if (!isFiniteNumber(amount)) return "—";
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  if (abs >= 10_000_000) return `${sign}₹${trimDecimal(abs / 10_000_000)}Cr`;
  if (abs >= 100_000) return `${sign}₹${trimDecimal(abs / 100_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trimDecimal(abs / 1_000)}k`;
  return `${sign}₹${abs}`;
}

/** "₹8,000 – ₹15,000", "From ₹8,000", "Up to ₹15,000", or "—". */
export function formatINRRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const hasMin = isFiniteNumber(min);
  const hasMax = isFiniteNumber(max);
  if (hasMin && hasMax) {
    return min === max
      ? formatINR(min)
      : `${formatINR(min)} – ${formatINR(max)}`;
  }
  if (hasMin) return `From ${formatINR(min)}`;
  if (hasMax) return `Up to ${formatINR(max)}`;
  return "—";
}

/** 1234567 -> "12,34,567". */
export function formatNumber(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return "—";
  return numberFormatter.format(value);
}

/** pluralize(1, "bed") -> "1 bed"; pluralize(3, "bed") -> "3 beds". */
export function pluralize(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

/** Straight-line distance: 850 -> "850 m", 1240 -> "1.2 km", 12400 -> "12 km". */
export function formatDistance(metres: number | null | undefined): string {
  if (!isFiniteNumber(metres) || metres < 0) return "—";
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  const km = metres / 1000;
  return km < 10 ? `${trimDecimal(km)} km` : `${Math.round(km)} km`;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO timestamp -> "11 Nov 2026" (India time, so server and client agree). */
export function formatDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  },
): string {
  const date = toDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    ...options,
  }).format(date);
}

/** ISO timestamp -> "11 Nov 2026, 4:05 pm" (India time). */
export function formatDateTime(
  value: string | number | Date | null | undefined,
): string {
  return formatDate(value, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const RELATIVE_STEPS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60],
];

/**
 * "3 days ago", "in 2 hours", "just now". `now` is a parameter so callers on
 * the server can pass a request-time value and tests stay deterministic.
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  now: Date | number = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return "—";
  const seconds = Math.round(
    (date.getTime() - (now instanceof Date ? now.getTime() : now)) / 1000,
  );
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  const formatter = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_STEPS) {
    if (abs >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(Math.round(seconds / 60), "minute");
}

/** "Asha Rao" -> "AR"; "zuvio" -> "Z"; empty -> "?". */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
