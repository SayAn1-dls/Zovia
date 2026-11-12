import type { LatLng } from "../schemas";
import { elementPoint, type OverpassElement } from "./overpass";

/**
 * Real hostels, PGs and guest houses mapped on OpenStreetMap around a city centre (spec 14.3
 * discovery: price and vacancy unknown). Only what OSM contributors recorded is shown: name,
 * kind, address, and phone / website when present. Nothing is guessed.
 */

export const HOUSING_RADIUS_M = 3500;
export const HOUSING_LIMIT = 40;

export type OsmHousingKind = "hostel" | "pg" | "guest_house" | "dormitory";

export type OsmHousing = {
  id: string;
  name: string;
  kind: OsmHousingKind;
  lat: number;
  lng: number;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** From the name only ("Ladies Hostel" -> female); null when the name says nothing. */
  gender_hint?: "male" | "female" | "any" | null;
  osm_url: string;
};

export const OSM_HOUSING_KIND_LABELS: Record<OsmHousingKind, string> = {
  hostel: "Hostel",
  pg: "PG",
  guest_house: "Guest house",
  dormitory: "Dormitory",
};

export function buildHousingQuery(point: LatLng, radius = HOUSING_RADIUS_M): string {
  const around = `around:${Math.round(radius)},${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
  return [
    "[out:json][timeout:25];",
    "(",
    `  nw["tourism"~"^(hostel|guest_house)$"]["name"](${around});`,
    `  nw["building"="dormitory"]["name"](${around});`,
    ");",
    `out center tags ${HOUSING_LIMIT * 2};`,
  ].join("\n");
}

const PG_NAME = /(^|[^a-z])(pg|p\.g\.)([^a-z]|$)|paying guest|co-?living/i;
// Holiday homes, hotels and serviced apartments tagged guest_house are not long-stay housing.
const NOT_HOUSING = /holiday home|hotel|resort|lodge|inn\b|serviced apartment|homestay|guest ?house of|circuit house|club/i;

function kindFor(tags: Record<string, string | undefined>, name: string): OsmHousingKind | null {
  if (NOT_HOUSING.test(name) && !PG_NAME.test(name)) return null;
  if (PG_NAME.test(name)) return "pg";
  if (tags.building === "dormitory") return "dormitory";
  if (tags.tourism === "hostel" || /hostel/i.test(name)) return "hostel";
  if (tags.tourism === "guest_house") return "guest_house";
  return null;
}

function address(tags: Record<string, string | undefined>): string | null {
  const parts = [tags["addr:housenumber"], tags["addr:street"], tags["addr:suburb"] ?? tags["addr:neighbourhood"]]
    .map((part) => part?.trim())
    .filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 200) : (tags["addr:full"]?.trim().slice(0, 200) ?? null);
}

function cleanUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function parseHousingResponse(json: unknown): OsmHousing[] {
  const elements = (json as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error("Overpass response has no elements array.");
  const seen = new Set<string>();
  const out: OsmHousing[] = [];
  for (const raw of elements as OverpassElement[]) {
    if (!raw || typeof raw !== "object" || !raw.tags || typeof raw.tags !== "object") continue;
    const tags = raw.tags as Record<string, string | undefined>;
    const name = (tags["name:en"] ?? tags.name)?.trim();
    if (!name) continue;
    const kind = kindFor(tags, name);
    if (!kind) continue;
    const point = elementPoint(raw);
    const type = typeof raw.type === "string" ? raw.type : null;
    const id = typeof raw.id === "number" || typeof raw.id === "string" ? String(raw.id) : null;
    if (!point || !type || !id) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `osm:${type}/${id}`,
      name: name.slice(0, 200),
      kind,
      lat: point.lat,
      lng: point.lng,
      address: address(tags),
      phone: (tags["contact:phone"] ?? tags.phone)?.split(";")[0]?.trim() || null,
      website: cleanUrl(tags["contact:website"] ?? tags.website),
      osm_url: `https://www.openstreetmap.org/${type}/${id}`,
    });
  }
  const order: Record<OsmHousingKind, number> = { pg: 0, hostel: 1, dormitory: 2, guest_house: 3 };
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name)).slice(0, HOUSING_LIMIT);
}
