import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import { roundCoordinate } from "./geo";
import { fetchPhoto, textSearch } from "./google/places";
import { normaliseGeocodeQuery } from "./osm/nominatim";
import { buildHousingQuery, parseHousingResponse, type OsmHousing } from "./osm/housing";
import { fetchOverpass, OSM_ATTRIBUTION, selectNearby } from "./osm/overpass";
import { createOpenStreetMapProvider, type LocationProvider } from "./provider";
import {
  NEARBY_RADIUS_M,
  type GeocodeResult,
  type GooglePlace,
  type LatLng,
  type NearbyPlacesResult,
} from "./schemas";

/**
 * Location services. Public data from public providers, so nothing here needs a user; results
 * are cached ("use cache") so we stay well inside the OpenStreetMap usage policies:
 *   geocode: per normalised query, for days;
 *   nearby:  per ~110 m area (rounded lat/lng), for days; distances are then computed from the
 *            exact point, and they are straight-line distances, labelled so in the UI.
 * Provider failures become `unavailable`; nothing is ever substituted.
 */

export const LOCATION_CACHE_TAGS = { geocode: "geocode", nearby: "nearby-places" } as const;

/** Extra radius fetched around the rounded centre so the exact point's radius is still covered. */
const ROUNDING_PADDING_M = 120;

function provider(): LocationProvider {
  const site = env().NEXT_PUBLIC_SITE_URL;
  return createOpenStreetMapProvider({ userAgent: `Zovia/0.1 (+${site})`, referer: site });
}

async function cachedGeocode(normalisedQuery: string): Promise<GeocodeResult[]> {
  "use cache";
  cacheLife("days");
  cacheTag(LOCATION_CACHE_TAGS.geocode);
  return provider().geocode(normalisedQuery);
}

/** Addresses in India matching `q` (OpenStreetMap Nominatim). */
export async function geocodeAddress(q: string): Promise<GeocodeResult[]> {
  try {
    return await cachedGeocode(normaliseGeocodeQuery(q));
  } catch (cause) {
    logger.warn("locations.geocode_failed", { error: serializeError(cause) });
    throw errors.unavailable("Address search is not available right now. Place the pin on the map instead.", {
      cause,
    });
  }
}

async function cachedPlacesAround(lat: number, lng: number) {
  "use cache";
  cacheLife("days");
  cacheTag(LOCATION_CACHE_TAGS.nearby);
  return provider().placesAround({ lat, lng }, NEARBY_RADIUS_M + ROUNDING_PADDING_M);
}

/** Named colleges, stations, hospitals, shops ... within 2 km of `point`, nearest first per kind. */
export async function getNearbyPlaces(point: LatLng): Promise<NearbyPlacesResult> {
  try {
    const places = await cachedPlacesAround(roundCoordinate(point.lat), roundCoordinate(point.lng));
    return {
      places: selectNearby(places, point),
      radius_m: NEARBY_RADIUS_M,
      source: "openstreetmap",
      attribution: OSM_ATTRIBUTION,
    };
  } catch (cause) {
    logger.warn("locations.nearby_failed", { error: serializeError(cause) });
    throw errors.unavailable("Nearby places couldn't load right now.", { cause });
  }
}

// ───────────────────────────── Google Places discovery (optional) ─────────────────────────────

/** True when GOOGLE_MAPS_API_KEY is configured. The key itself never leaves the server. */
export function isGooglePlacesEnabled(): boolean {
  return Boolean(env().GOOGLE_MAPS_API_KEY);
}

export type GooglePlacesSection =
  | { status: "disabled" }
  | { status: "error" }
  | { status: "ok"; places: GooglePlace[] };

/**
 * PGs and hostels on Google Maps for a city, fetched live (never stored). "disabled" without a
 * key, "error" when Google fails; the caller hides or explains the section accordingly.
 */
export async function getGooglePlacesForCity(cityName: string): Promise<GooglePlacesSection> {
  const apiKey = env().GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { status: "disabled" };
  try {
    return { status: "ok", places: await textSearch(cityName, { apiKey }) };
  } catch (cause) {
    logger.warn("locations.google_places_failed", { error: serializeError(cause) });
    return { status: "error" };
  }
}

/** Bytes of a Google Places photo, proxied so the key stays on the server. */
export async function getGooglePlacePhoto(name: string): Promise<{ body: ArrayBuffer; contentType: string }> {
  const apiKey = env().GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw errors.notFound("Google Maps photos are not enabled.");
  try {
    return await fetchPhoto(name, { apiKey });
  } catch (cause) {
    logger.warn("locations.google_photo_failed", { error: serializeError(cause) });
    throw errors.unavailable("That photo could not be loaded.", { cause });
  }
}

// ───────────────────────────── OpenStreetMap housing discovery ─────────────────────────────

export type OsmHousingSection = { status: "ok"; places: OsmHousing[]; attribution: string } | { status: "error" };

async function cachedHousingAround(lat: number, lng: number): Promise<OsmHousing[]> {
  "use cache";
  cacheLife("days");
  cacheTag("osm-housing");
  const json = await fetchOverpass(buildHousingQuery({ lat, lng }), {
    userAgent: `Zovia/0.1 (+${env().NEXT_PUBLIC_SITE_URL})`,
    timeoutMs: 30_000,
  });
  return parseHousingResponse(json);
}

/**
 * The public Overpass servers are shared and often busy (timeouts, 429). Successes are cached for
 * days; after a failure we stop asking for a while (per server instance) so pages answer quickly
 * with "couldn't load" instead of waiting on a server that is refusing us.
 */
const HOUSING_BACKOFF_MS = 10 * 60_000;
let housingFailedAt = 0;

/** Real hostels / PGs / guest houses mapped on OpenStreetMap around a city centre. */
export async function getOsmHousingForCity(centre: LatLng): Promise<OsmHousingSection> {
  if (Date.now() - housingFailedAt < HOUSING_BACKOFF_MS) return { status: "error" };
  try {
    const places = await cachedHousingAround(roundCoordinate(centre.lat), roundCoordinate(centre.lng));
    return { status: "ok", places, attribution: OSM_ATTRIBUTION };
  } catch (error) {
    housingFailedAt = Date.now();
    logger.warn("locations.osm_housing_failed", { error: serializeError(error) });
    return { status: "error" };
  }
}
