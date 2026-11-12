"use client";

import { useQuery } from "@tanstack/react-query";

import { apiFetch, createQueryKeys, shouldRetry } from "@/lib/api/client";

import type { GeocodeResult, LatLng, NearbyPlacesResult } from "./schemas";

/** Client hooks for /api/v1/locations (TanStack Query). */

export const locationKeys = createQueryKeys("locations");

/** Nearby places for a point (public). Cached for an hour in the browser; the server caches for days. */
export function useNearbyPlaces(point: LatLng | null) {
  return useQuery({
    queryKey: locationKeys.scope("nearby", point?.lat ?? null, point?.lng ?? null),
    queryFn: ({ signal }) =>
      apiFetch<NearbyPlacesResult>("/locations/nearby", { query: { lat: point!.lat, lng: point!.lng }, signal }),
    enabled: point !== null,
    staleTime: 60 * 60 * 1000,
    retry: shouldRetry,
  });
}

/**
 * Address search for placing a pin (signed-in users; used by the owner portal). Pass the text
 * only when the user asks to search (button / submit), not on every keystroke: the provider's
 * policy forbids autocomplete-style traffic.
 */
export function useGeocode(q: string | null) {
  const query = q?.trim() ?? "";
  return useQuery({
    queryKey: locationKeys.scope("geocode", query.toLowerCase()),
    queryFn: ({ signal }) => apiFetch<GeocodeResult[]>("/locations/geocode", { query: { q: query }, signal }),
    enabled: query.length >= 3,
    staleTime: 24 * 60 * 60 * 1000,
    retry: shouldRetry,
  });
}
