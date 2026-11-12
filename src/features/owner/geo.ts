import type { LatLng } from "./schemas";

/**
 * PostGIS geography points as they cross PostgREST (pure; unit-tested).
 *
 * Reads: a `geography(Point, 4326)` column is returned as hex-encoded (E)WKB, e.g.
 * "0101000020E6100000" + 8-byte X (longitude) + 8-byte Y (latitude). GeoJSON objects are accepted
 * too, in case the column is ever selected through a function that returns JSON.
 * Writes: EWKT "SRID=4326;POINT(lng lat)" — longitude first.
 */

const WKB_POINT = 1;
const EWKB_SRID_FLAG = 0x20000000;

function readDouble(view: DataView, offset: number, littleEndian: boolean): number {
  return view.getFloat64(offset, littleEndian);
}

export function parsePoint(value: unknown): LatLng | null {
  if (value && typeof value === "object") {
    const geo = value as { type?: unknown; coordinates?: unknown };
    if (geo.type === "Point" && Array.isArray(geo.coordinates) && geo.coordinates.length >= 2) {
      const [lng, lat] = geo.coordinates as unknown[];
      return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat, lng }
        : null;
    }
    return null;
  }
  if (typeof value !== "string" || !/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null;

  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  if (bytes.length < 21) return null;
  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  const type = view.getUint32(1, littleEndian);
  if ((type & 0xff) !== WKB_POINT) return null;
  let offset = 5;
  if (type & EWKB_SRID_FLAG) offset += 4;
  if (bytes.length < offset + 16) return null;
  const lng = readDouble(view, offset, littleEndian);
  const lat = readDouble(view, offset + 8, littleEndian);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** EWKT for an insert/update of a geography column. Coordinates rounded to ~1 cm. */
export function toPointEwkt(point: LatLng): string {
  const round = (n: number) => Math.round(n * 1e7) / 1e7;
  return `SRID=4326;POINT(${round(point.lng)} ${round(point.lat)})`;
}

/** "Bed 1", "Bed 2", ... — the first free number in a room (pure; unit-tested). */
export function nextBedLabel(existing: readonly string[]): string {
  const taken = new Set(existing.map((label) => label.trim().toLowerCase()));
  for (let n = 1; n <= 99; n += 1) {
    const label = `Bed ${n}`;
    if (!taken.has(label.toLowerCase())) return label;
  }
  return `Bed ${existing.length + 1}`;
}
