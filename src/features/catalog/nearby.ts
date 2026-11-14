import "server-only";

import { straightLineMetres } from "@/features/locations/geo";

import type { CatalogListing } from "./listings";
import { NEARBY_BY_LOCALITY } from "./nearby-data";

export type CatalogNearbyKind =
  | "restaurant"
  | "cafe"
  | "grocery"
  | "metro_station"
  | "railway_station"
  | "hospital"
  | "college"
  | "university";

export type CatalogNearbyPlace = { kind: CatalogNearbyKind; name: string; lat: number; lng: number; metres: number };

export const NEARBY_GROUPS: { title: string; kinds: CatalogNearbyKind[] }[] = [
  { title: "Restaurants", kinds: ["restaurant"] },
  { title: "Cafés", kinds: ["cafe"] },
  { title: "Grocery & supermarkets", kinds: ["grocery"] },
  { title: "Metro & railway stations", kinds: ["metro_station", "railway_station"] },
  { title: "Hospitals", kinds: ["hospital"] },
  { title: "Colleges & universities", kinds: ["college", "university"] },
];

/**
 * Named places around a PG's neighbourhood (OpenStreetMap, collected per neighbourhood), with the
 * straight-line distance from the PG's own pin, nearest first.
 */
export function nearbyForListing(listing: CatalogListing): CatalogNearbyPlace[] {
  const rows = NEARBY_BY_LOCALITY[listing.city_slug]?.[listing.locality] ?? [];
  return rows
    .map(([kind, name, lat, lng]) => ({
      kind: kind as CatalogNearbyKind,
      name,
      lat,
      lng,
      metres: Math.round(straightLineMetres({ lat: listing.lat, lng: listing.lng }, { lat, lng })),
    }))
    .sort((a, b) => a.metres - b.metres);
}
