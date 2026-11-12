import { straightLineMetres } from "../geo";
import { NEARBY_KINDS, NEARBY_PER_KIND, NEARBY_RADIUS_M, type LatLng, type NearbyKind, type NearbyPlace } from "../schemas";

/**
 * OpenStreetMap nearby places through the Overpass API (https://wiki.openstreetmap.org/wiki/Overpass_API).
 * Pure query building and normalisation live here and are unit-tested; the HTTP call is
 * `fetchOverpass`. Data is © OpenStreetMap contributors (ODbL) and must be attributed.
 */

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

/** Busy categories (shops, food, bus stops) use a smaller radius to keep the response small. */
const NEAR_RADIUS_M = 1200;

/**
 * One Overpass QL query for every kind we show, around `point`. `out center` gives ways and
 * relations (campuses, malls, hospitals) a centre point.
 */
export function buildOverpassQuery(point: LatLng, radius = NEARBY_RADIUS_M): string {
  const near = Math.min(radius, NEAR_RADIUS_M);
  const at = `${point.lat.toFixed(6)},${point.lng.toFixed(6)}`;
  const wide = `(around:${radius},${at})`;
  const close = `(around:${near},${at})`;
  return [
    "[out:json][timeout:25];",
    "(",
    `  nwr${wide}["amenity"~"^(college|university|hospital)$"];`,
    `  nwr${wide}["railway"~"^(station|halt)$"];`,
    `  nwr${wide}["station"="subway"];`,
    `  nwr${wide}["shop"="mall"];`,
    `  nwr${close}["amenity"~"^(pharmacy|cafe|restaurant|bus_station)$"];`,
    `  node${close}["highway"="bus_stop"];`,
    `  nwr${close}["shop"~"^(supermarket|convenience|greengrocer)$"];`,
    `  nwr${close}["leisure"="fitness_centre"];`,
    ");",
    "out center tags 1500;",
  ].join("\n");
}

type Tags = Record<string, string | undefined>;

/** Maps OSM tags to one of our place kinds, or null when the element is not one we show. */
export function classifyOsmTags(tags: Tags): NearbyKind | null {
  const amenity = tags.amenity;
  if (amenity === "university") return "university";
  if (amenity === "college") return "college";
  if (amenity === "hospital") return "hospital";
  if (amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";

  const isMetro =
    tags.station === "subway" ||
    tags.station === "light_rail" ||
    tags.subway === "yes" ||
    tags.light_rail === "yes" ||
    tags.railway === "subway_entrance";
  if (tags.railway === "station" || tags.railway === "halt" || tags.public_transport === "station") {
    if (isMetro) return "metro_station";
    if (tags.railway === "station" || tags.railway === "halt") return "railway_station";
  }
  if (tags.station === "subway") return "metro_station";

  if (tags.highway === "bus_stop" || amenity === "bus_station") return "bus_stop";
  if (tags.shop === "mall") return "shopping_centre";
  if (tags.shop === "supermarket" || tags.shop === "convenience" || tags.shop === "greengrocer") return "grocery";
  if (amenity === "cafe") return "cafe";
  if (amenity === "restaurant") return "restaurant";
  if (tags.leisure === "fitness_centre") return "gym";
  return null;
}

export type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: unknown;
};

export function elementPoint(element: OverpassElement): LatLng | null {
  const lat = typeof element.lat === "number" ? element.lat : element.center?.lat;
  const lng = typeof element.lon === "number" ? element.lon : element.center?.lon;
  return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
    ? { lat, lng }
    : null;
}

/** A classified, named place with its coordinates (no distance yet). Cacheable per area. */
export type OsmPlace = Omit<NearbyPlace, "straight_line_m">;

/**
 * Overpass JSON -> named places of the kinds we show. Unnamed elements are dropped (we never
 * invent a name), as is anything malformed.
 */
export function parseOverpassResponse(json: unknown): OsmPlace[] {
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error("Overpass response has no elements array.");
  const places: OsmPlace[] = [];
  for (const raw of elements as OverpassElement[]) {
    if (!raw || typeof raw !== "object" || !raw.tags || typeof raw.tags !== "object") continue;
    const tags = raw.tags as Tags;
    const name = (tags["name:en"] ?? tags.name)?.trim();
    if (!name) continue;
    const kind = classifyOsmTags(tags);
    if (!kind) continue;
    const point = elementPoint(raw);
    if (!point) continue;
    const type = typeof raw.type === "string" ? raw.type : "node";
    const id = typeof raw.id === "number" || typeof raw.id === "string" ? String(raw.id) : null;
    if (!id) continue;
    places.push({ id: `osm:${type}/${id}`, kind, name: name.slice(0, 200), lat: point.lat, lng: point.lng });
  }
  return places;
}

/**
 * Distances from the exact `origin`, places outside `radius` dropped, duplicates (the same name
 * and kind, e.g. both platforms of a station) collapsed to the nearest, then the nearest
 * `perKind` of each kind, ordered by kind (display order) and distance.
 */
export function selectNearby(
  places: readonly OsmPlace[],
  origin: LatLng,
  options: { radius?: number; perKind?: number } = {},
): NearbyPlace[] {
  const radius = options.radius ?? NEARBY_RADIUS_M;
  const perKind = options.perKind ?? NEARBY_PER_KIND;
  const nearest = new Map<string, NearbyPlace>();
  for (const place of places) {
    const straight_line_m = Math.round(straightLineMetres(origin, place));
    if (straight_line_m > radius) continue;
    const key = `${place.kind}|${place.name.toLowerCase()}`;
    const existing = nearest.get(key);
    if (!existing || straight_line_m < existing.straight_line_m) nearest.set(key, { ...place, straight_line_m });
  }
  const order = new Map(NEARBY_KINDS.map((entry, index) => [entry.kind as NearbyKind, index]));
  const byKind = new Map<NearbyKind, NearbyPlace[]>();
  for (const place of nearest.values()) {
    const list = byKind.get(place.kind) ?? [];
    list.push(place);
    byKind.set(place.kind, list);
  }
  return [...byKind.entries()]
    .sort(([a], [b]) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
    .flatMap(([, list]) =>
      list.sort((a, b) => a.straight_line_m - b.straight_line_m || a.name.localeCompare(b.name)).slice(0, perKind),
    );
}

/**
 * POSTs the query to Overpass, trying the next public endpoint when one fails. Identifies the
 * application with `userAgent` as the Overpass usage policy asks. Throws when every endpoint
 * fails; callers show "couldn't load" and never substitute data.
 */
export async function fetchOverpass(
  query: string,
  options: { userAgent: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<unknown> {
  const doFetch = options.fetchImpl ?? fetch;
  let lastError: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await doFetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json",
          "User-Agent": options.userAgent,
        },
        body: new URLSearchParams({ data: query }).toString(),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
      if (!response.ok) throw new Error(`Overpass ${new URL(endpoint).host} answered ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error("Every Overpass endpoint failed.", { cause: lastError });
}
