import { z } from "zod";

import type { Database } from "@/lib/database.types";

/** Location contracts (isomorphic). Field names are snake_case like the rest of the API. */

export type PlaceKind = Database["public"]["Enums"]["place_kind"];
export type LatLng = { lat: number; lng: number };

/** India's bounding box, the same one the `properties_location_in_india` CHECK uses. */
export const INDIA_BOUNDS = { minLat: 6, maxLat: 38, minLng: 68, maxLng: 98 } as const;

export function isInIndia(point: LatLng): boolean {
  return (
    point.lat >= INDIA_BOUNDS.minLat &&
    point.lat <= INDIA_BOUNDS.maxLat &&
    point.lng >= INDIA_BOUNDS.minLng &&
    point.lng <= INDIA_BOUNDS.maxLng
  );
}

/** The kinds of nearby place we look up, in display order, with their section and label. */
export const NEARBY_KINDS = [
  { kind: "college", label: "College", group: "Study" },
  { kind: "university", label: "University", group: "Study" },
  { kind: "metro_station", label: "Metro station", group: "Getting around" },
  { kind: "railway_station", label: "Railway station", group: "Getting around" },
  { kind: "bus_stop", label: "Bus stop", group: "Getting around" },
  { kind: "hospital", label: "Hospital", group: "Health" },
  { kind: "pharmacy", label: "Pharmacy", group: "Health" },
  { kind: "grocery", label: "Grocery", group: "Daily needs" },
  { kind: "cafe", label: "Cafe", group: "Daily needs" },
  { kind: "restaurant", label: "Restaurant", group: "Daily needs" },
  { kind: "gym", label: "Gym", group: "Daily needs" },
  { kind: "shopping_centre", label: "Mall", group: "Daily needs" },
] as const satisfies readonly { kind: PlaceKind; label: string; group: string }[];

export type NearbyKind = (typeof NEARBY_KINDS)[number]["kind"];
export type NearbyGroup = (typeof NEARBY_KINDS)[number]["group"];

export const NEARBY_KIND_LABELS = Object.fromEntries(NEARBY_KINDS.map((k) => [k.kind, k.label])) as Record<
  NearbyKind,
  string
>;

/** Search radius for nearby places, metres (straight line). */
export const NEARBY_RADIUS_M = 2000;
/** At most this many places of each kind are returned (the nearest ones). */
export const NEARBY_PER_KIND = 4;

/** A real place near a point, from a location provider. Distance is straight-line, never a route. */
export type NearbyPlace = {
  /** Provider-scoped id, e.g. "osm:node/123". */
  id: string;
  kind: NearbyKind;
  name: string;
  lat: number;
  lng: number;
  /** Straight-line ("as the crow flies") distance from the requested point, metres. */
  straight_line_m: number;
};

export type NearbyPlacesResult = {
  places: NearbyPlace[];
  radius_m: number;
  source: "openstreetmap";
  /** Must be shown with the data (ODbL). */
  attribution: string;
};

export type GeocodeResult = {
  /** Human-readable address from the provider. */
  label: string;
  lat: number;
  lng: number;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  source: "openstreetmap";
};

/** A place from Google Maps for the discovery section. Price and vacancy are never known. */
export type GooglePlace = {
  place_id: string;
  name: string;
  address: string | null;
  rating: number | null;
  rating_count: number | null;
  maps_url: string | null;
  photo: { name: string; attributions: { name: string; uri: string | null }[] } | null;
};

const coordinate = (min: number, max: number, message: string) =>
  z.coerce.number({ error: message }).refine((value) => Number.isFinite(value) && value >= min && value <= max, message);

/** `?lat=&lng=`: a point inside India (the only place we have listings). */
export const nearbyQuerySchema = z.object({
  lat: coordinate(INDIA_BOUNDS.minLat, INDIA_BOUNDS.maxLat, "Enter a latitude inside India."),
  lng: coordinate(INDIA_BOUNDS.minLng, INDIA_BOUNDS.maxLng, "Enter a longitude inside India."),
});
export type NearbyQuery = z.output<typeof nearbyQuerySchema>;

export const geocodeQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(3, "Type at least 3 characters.")
    .max(200, "Keep the address under 200 characters."),
});
export type GeocodeQuery = z.output<typeof geocodeQuerySchema>;

/** Resource name of a Places photo: "places/<id>/photos/<id>". Anything else is refused. */
export const GOOGLE_PHOTO_NAME = /^places\/[A-Za-z0-9_-]{1,300}\/photos\/[A-Za-z0-9_-]{1,1000}$/;

export const googlePhotoQuerySchema = z.object({
  name: z.string().regex(GOOGLE_PHOTO_NAME, "That photo reference is not valid."),
});
