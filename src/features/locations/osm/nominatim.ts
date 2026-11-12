import type { GeocodeResult } from "../schemas";

/**
 * OpenStreetMap geocoding through Nominatim (https://nominatim.org). Usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/): at most 1 request per second, a
 * User-Agent that identifies the application, results cached, no client-side autocomplete.
 * The service layer caches results; `waitForSlot` spaces requests from this server instance.
 */

export const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";

const MIN_INTERVAL_MS = 1100;
let nextSlotAt = 0;

/** Resolves when this instance may send its next Nominatim request (>= 1.1 s apart). */
export async function waitForSlot(now: () => number = Date.now): Promise<void> {
  const current = now();
  const slot = Math.max(current, nextSlotAt);
  nextSlotAt = slot + MIN_INTERVAL_MS;
  const delay = slot - current;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

/** Lower-case, single-spaced query: the cache key for a geocode lookup. */
export function normaliseGeocodeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildNominatimUrl(q: string, limit = 5): string {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("accept-language", "en");
  return url.toString();
}

type NominatimAddress = Record<string, string | undefined>;
type NominatimItem = { lat?: unknown; lon?: unknown; display_name?: unknown; address?: unknown };

function first(address: NominatimAddress, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = address[key]?.trim();
    if (value) return value;
  }
  return null;
}

/** Nominatim jsonv2 -> our geocode results. Items without valid coordinates are dropped. */
export function parseNominatimResponse(json: unknown): GeocodeResult[] {
  if (!Array.isArray(json)) throw new Error("Nominatim response is not an array.");
  const results: GeocodeResult[] = [];
  for (const raw of json as NominatimItem[]) {
    if (!raw || typeof raw !== "object") continue;
    const lat = Number(raw.lat);
    const lng = Number(raw.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const address = (raw.address && typeof raw.address === "object" ? raw.address : {}) as NominatimAddress;
    const pincode = first(address, ["postcode"]);
    results.push({
      label: typeof raw.display_name === "string" ? raw.display_name : `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      locality: first(address, ["suburb", "neighbourhood", "quarter", "city_district", "residential", "village"]),
      city: first(address, ["city", "town", "municipality", "county", "state_district"]),
      state: first(address, ["state"]),
      pincode: pincode && /^[1-9][0-9]{5}$/.test(pincode.replace(/\s/g, "")) ? pincode.replace(/\s/g, "") : null,
      source: "openstreetmap",
    });
  }
  return results;
}

export async function fetchNominatim(
  q: string,
  options: { userAgent: string; referer?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<unknown> {
  await waitForSlot();
  const response = await (options.fetchImpl ?? fetch)(buildNominatimUrl(q), {
    headers: {
      Accept: "application/json",
      "User-Agent": options.userAgent,
      ...(options.referer ? { Referer: options.referer } : {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
  });
  if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
  return response.json();
}
