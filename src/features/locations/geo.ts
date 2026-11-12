import { formatDistance } from "@/lib/format";

import type { LatLng } from "./schemas";

/** Pure geometry helpers (isomorphic, unit-tested). */

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle ("straight-line") distance in metres between two points (haversine). */
export function straightLineMetres(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Rounds a coordinate for use as a cache key. 3 decimals is about 110 m of latitude, so nearby
 * listings share one provider lookup while distances are still computed from the exact point.
 */
export function roundCoordinate(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** "850 m straight-line", "1.2 km straight-line". Never presented as a route distance. */
export function straightLineLabel(metres: number | null | undefined): string {
  const text = formatDistance(metres);
  return text === "—" ? text : `${text} straight-line`;
}

/**
 * Parses a PostGIS point as PostgREST returns it (hex EWKB, e.g. "0101000020E6100000…") or as
 * GeoJSON. Returns null for anything that is not a 2-D point.
 */
export function parsePoint(value: unknown): LatLng | null {
  if (value && typeof value === "object") {
    const geo = value as { type?: unknown; coordinates?: unknown };
    if (geo.type === "Point" && Array.isArray(geo.coordinates)) {
      const [lng, lat] = geo.coordinates as unknown[];
      return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null;
    }
    return null;
  }
  if (typeof value !== "string" || !/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  if (bytes.length < 21) return null;
  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian);
  const hasSrid = (type & 0x20000000) !== 0;
  const hasZ = (type & 0x80000000) !== 0;
  const hasM = (type & 0x40000000) !== 0;
  if ((type & 0xff) !== 1 || hasZ || hasM) return null;
  const offset = 5 + (hasSrid ? 4 : 0);
  if (bytes.length < offset + 16) return null;
  const lng = view.getFloat64(offset, littleEndian);
  const lat = view.getFloat64(offset + 8, littleEndian);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}
