import { describe, expect, it } from "vitest";

import { parsePoint, roundCoordinate, straightLineLabel, straightLineMetres } from "./geo";

describe("straightLineMetres", () => {
  it("is zero for the same point", () => {
    expect(straightLineMetres({ lat: 12.97, lng: 77.59 }, { lat: 12.97, lng: 77.59 })).toBe(0);
  });

  it("matches a known distance (Connaught Place -> India Gate, about 2.4 km)", () => {
    const d = straightLineMetres({ lat: 28.6315, lng: 77.2167 }, { lat: 28.6129, lng: 77.2295 });
    expect(d).toBeGreaterThan(2300);
    expect(d).toBeLessThan(2500);
  });

  it("is symmetric", () => {
    const a = { lat: 19.076, lng: 72.8777 };
    const b = { lat: 18.5204, lng: 73.8567 };
    expect(straightLineMetres(a, b)).toBeCloseTo(straightLineMetres(b, a), 6);
  });
});

describe("roundCoordinate", () => {
  it("rounds to 3 decimals by default", () => {
    expect(roundCoordinate(12.971598)).toBe(12.972);
    expect(roundCoordinate(77.59463)).toBe(77.595);
  });
});

describe("straightLineLabel", () => {
  it("always says straight-line", () => {
    expect(straightLineLabel(850)).toBe("850 m straight-line");
    expect(straightLineLabel(1240)).toBe("1.2 km straight-line");
  });

  it("returns a dash for unknown distances", () => {
    expect(straightLineLabel(null)).toBe("—");
    expect(straightLineLabel(-5)).toBe("—");
  });
});

describe("parsePoint", () => {
  it("parses PostGIS hex EWKB with an SRID (as PostgREST returns geography)", () => {
    // cities.bengaluru: ST_MakePoint(77.5946, 12.9716), SRID 4326
    const point = parsePoint("0101000020E6100000E78C28ED0D6653405396218E75F12940");
    expect(point?.lat).toBeCloseTo(12.9716, 6);
    expect(point?.lng).toBeCloseTo(77.5946, 6);
  });

  it("parses GeoJSON points", () => {
    expect(parsePoint({ type: "Point", coordinates: [72.8777, 19.076] })).toEqual({ lat: 19.076, lng: 72.8777 });
  });

  it("rejects anything that is not a 2-D point", () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint("zz")).toBeNull();
    expect(parsePoint("0102000020E6100000")).toBeNull();
    expect(parsePoint({ type: "LineString", coordinates: [] })).toBeNull();
  });
});
