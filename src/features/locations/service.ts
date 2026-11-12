import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { env } from "@/server/env";
import { createSupabasePublicClient } from "@/server/supabase/public";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import { roundCoordinate } from "./geo";
import { fetchPhoto, textSearch } from "./google/places";
import { normaliseGeocodeQuery } from "./osm/nominatim";
import type { OsmHousing } from "./osm/housing";
import { OSM_ATTRIBUTION, selectNearby } from "./osm/overpass";
import * as repo from "./repository";
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
/** Imported places are searched a little wider, since only named places are imported. */
const NEARBY_IMPORTED_RADIUS_M = 3000;

function provider(): LocationProvider {
  const site = env().NEXT_PUBLIC_SITE_URL;
  return createOpenStreetMapProvider({ userAgent: `ZUVIO/0.1 (+${site})`, referer: site });
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
  // Imported data first (instant, reliable); the live Overpass query only where nothing is imported.
  try {
    const imported = await repo.nearbyFromImported(createSupabasePublicClient(), point, NEARBY_IMPORTED_RADIUS_M);
    if (imported.length > 0) {
      return { places: imported, radius_m: NEARBY_IMPORTED_RADIUS_M, source: "openstreetmap", attribution: OSM_ATTRIBUTION };
    }
  } catch (cause) {
    logger.warn("locations.nearby_imported_failed", { error: serializeError(cause) });
  }
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

/** Real hostels / PGs / guest houses mapped on OpenStreetMap around a city centre. */
export async function getOsmHousingForCity(citySlug: string): Promise<OsmHousingSection> {
  try {
    const places = await repo.housingForCity(createSupabasePublicClient(), citySlug);
    return { status: "ok", places, attribution: OSM_ATTRIBUTION };
  } catch (error) {
    logger.warn("locations.osm_housing_failed", { error: serializeError(error) });
    return { status: "error" };
  }
}
