import { describe, expect, it } from "vitest";

import { nextBedLabel, parsePoint, toPointEwkt } from "./geo";

function ewkbHex(lng: number, lat: number, withSrid = true): string {
  const buffer = new ArrayBuffer(withSrid ? 25 : 21);
  const view = new DataView(buffer);
  view.setUint8(0, 1);
  view.setUint32(1, withSrid ? 0x20000001 : 1, true);
  let offset = 5;
  if (withSrid) {
    view.setUint32(5, 4326, true);
    offset = 9;
  }
  view.setFloat64(offset, lng, true);
  view.setFloat64(offset + 8, lat, true);
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

describe("parsePoint", () => {
  it("reads hex EWKB (with and without SRID)", () => {
    expect(parsePoint(ewkbHex(77.5946, 12.9716))).toEqual({ lat: 12.9716, lng: 77.5946 });
    expect(parsePoint(ewkbHex(72.8777, 19.076, false))).toEqual({ lat: 19.076, lng: 72.8777 });
  });

  it("reads the PostGIS literal for Bengaluru", () => {
    // select 'SRID=4326;POINT(77.5946 12.9716)'::geography
    expect(parsePoint("0101000020E6100000E78C28ED0D6653405396218E75F12940")).toEqual({ lat: 12.9716, lng: 77.5946 });
  });

  it("reads GeoJSON", () => {
    expect(parsePoint({ type: "Point", coordinates: [77.1, 28.6] })).toEqual({ lat: 28.6, lng: 77.1 });
  });

  it("returns null for anything else", () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint("zz")).toBeNull();
    expect(parsePoint("0102")).toBeNull();
    expect(parsePoint({ type: "LineString", coordinates: [] })).toBeNull();
  });
});

describe("toPointEwkt", () => {
  it("writes longitude first and rounds", () => {
    expect(toPointEwkt({ lat: 12.971598765432, lng: 77.594612345678 })).toBe("SRID=4326;POINT(77.5946123 12.9715988)");
  });
});

describe("nextBedLabel", () => {
  it("finds the first free number", () => {
    expect(nextBedLabel([])).toBe("Bed 1");
    expect(nextBedLabel(["Bed 1", "bed 2"])).toBe("Bed 3");
    expect(nextBedLabel(["Bed 2"])).toBe("Bed 1");
  });
});
