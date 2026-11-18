/**
 * Pure calendar helpers for stays, safe on the server and in the browser. Kept apart from
 * stay-url-state.ts, which builds nuqs parsers (client-only): server code such as the invoice and
 * e-mail builders imports these through stay-text.ts, and pulling nuqs into a route handler fails
 * the production build ("createParser is on the client").
 */

/** Today in India as YYYY-MM-DD (`now` is injectable for tests). */
export function indiaToday(now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now));
}

/** Calendar arithmetic on YYYY-MM-DD dates (UTC based, so no DST surprises). */
export function addDays(iso: string, days: number): string {
  const time = Date.parse(`${iso}T00:00:00Z`);
  return new Date(time + days * 86_400_000).toISOString().slice(0, 10);
}
