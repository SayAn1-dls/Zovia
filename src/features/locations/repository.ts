import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

import type { OsmHousing, OsmHousingKind } from "./osm/housing";
import type { LatLng, NearbyKind, NearbyPlace } from "./schemas";

/** Imported OpenStreetMap places (public.osm_places, filled by scripts/import-osm.mjs). */

export async function nearbyFromImported(supabase: AppSupabaseClient, point: LatLng, radiusM: number): Promise<NearbyPlace[]> {
  const { data, error } = await supabase.rpc("nearby_osm_places", { p_lat: point.lat, p_lng: point.lng, p_radius_m: radiusM, p_per_kind: 4 });
  if (error) throw fromSupabaseError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as NearbyKind,
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    straight_line_m: Math.round(row.distance_m),
  }));
}

export async function housingForCity(supabase: AppSupabaseClient, citySlug: string): Promise<OsmHousing[]> {
  const { data, error } = await supabase
    .from("osm_places")
    .select("id, kind, name, location, address, phone, website, gender_hint, source_url")
    .eq("category", "housing")
    .eq("city_slug", citySlug)
    .order("name")
    .limit(80);
  if (error) throw fromSupabaseError(error);
  const f = (hex: string) => Buffer.from(hex, "hex").readDoubleLE(0);
  return (data ?? []).flatMap((row) => {
    const m = typeof row.location === "string" ? row.location.match(/^0101000020E6100000([0-9A-F]{16})([0-9A-F]{16})$/i) : null;
    if (!m?.[1] || !m[2]) return [];
    return [
      {
        id: row.id,
        name: row.name,
        kind: row.kind as OsmHousingKind,
        lat: f(m[2]),
        lng: f(m[1]),
        address: row.address,
        phone: row.phone,
        website: row.website,
        gender_hint: row.gender_hint,
        osm_url: row.source_url,
      },
    ];
  });
}
