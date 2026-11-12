import { describe, expect, it } from "vitest";

import { buildOverpassQuery, classifyOsmTags, parseOverpassResponse, selectNearby, type OsmPlace } from "./overpass";

describe("classifyOsmTags", () => {
  it("maps OSM tags to our place kinds", () => {
    expect(classifyOsmTags({ amenity: "university" })).toBe("university");
    expect(classifyOsmTags({ amenity: "college" })).toBe("college");
    expect(classifyOsmTags({ railway: "station", station: "subway" })).toBe("metro_station");
    expect(classifyOsmTags({ public_transport: "station", subway: "yes", railway: "station" })).toBe("metro_station");
    expect(classifyOsmTags({ railway: "station" })).toBe("railway_station");
    expect(classifyOsmTags({ railway: "halt" })).toBe("railway_station");
    expect(classifyOsmTags({ highway: "bus_stop" })).toBe("bus_stop");
    expect(classifyOsmTags({ amenity: "hospital" })).toBe("hospital");
    expect(classifyOsmTags({ amenity: "pharmacy" })).toBe("pharmacy");
    expect(classifyOsmTags({ amenity: "cafe" })).toBe("cafe");
    expect(classifyOsmTags({ amenity: "restaurant" })).toBe("restaurant");
    expect(classifyOsmTags({ shop: "supermarket" })).toBe("grocery");
    expect(classifyOsmTags({ shop: "mall" })).toBe("shopping_centre");
    expect(classifyOsmTags({ leisure: "fitness_centre" })).toBe("gym");
  });

  it("ignores everything else", () => {
    expect(classifyOsmTags({ amenity: "bench" })).toBeNull();
    expect(classifyOsmTags({ public_transport: "station" })).toBeNull();
    expect(classifyOsmTags({})).toBeNull();
  });
});

describe("buildOverpassQuery", () => {
  it("asks for JSON around the point with centres for ways", () => {
    const q = buildOverpassQuery({ lat: 28.99312, lng: 77.0151 }, 2000);
    expect(q).toContain("[out:json]");
    expect(q).toContain("around:2000,28.993120,77.015100");
    expect(q).toContain("around:1200,28.993120,77.015100");
    expect(q).toContain("out center");
  });
});

describe("parseOverpassResponse", () => {
  it("keeps named, classified elements with coordinates (nodes and way centres)", () => {
    const places = parseOverpassResponse({
      elements: [
        { type: "node", id: 1, lat: 28.6, lon: 77.2, tags: { amenity: "cafe", name: "Blue Tokai" } },
        { type: "way", id: 2, center: { lat: 28.61, lon: 77.21 }, tags: { amenity: "university", name: "Delhi University", "name:en": "University of Delhi" } },
        { type: "node", id: 3, lat: 28.6, lon: 77.2, tags: { highway: "bus_stop" } },
        { type: "node", id: 4, lat: 28.6, lon: 77.2, tags: { amenity: "bench", name: "A bench" } },
        { type: "way", id: 5, tags: { amenity: "hospital", name: "No centre" } },
        null,
      ],
    });
    expect(places).toEqual([
      { id: "osm:node/1", kind: "cafe", name: "Blue Tokai", lat: 28.6, lng: 77.2 },
      { id: "osm:way/2", kind: "university", name: "University of Delhi", lat: 28.61, lng: 77.21 },
    ]);
  });

  it("throws on a response without elements (so the caller reports a failure)", () => {
    expect(() => parseOverpassResponse({ remark: "runtime error" })).toThrow();
  });
});

describe("selectNearby", () => {
  const origin = { lat: 28.6, lng: 77.2 };
  const at = (metresNorth: number) => ({ lat: origin.lat + metresNorth / 111_195, lng: origin.lng });
  const place = (id: string, kind: OsmPlace["kind"], name: string, metres: number): OsmPlace => ({
    id,
    kind,
    name,
    ...at(metres),
  });

  it("computes straight-line distances, drops places beyond the radius, orders by kind then distance", () => {
    const result = selectNearby(
      [
        place("a", "cafe", "Far cafe", 900),
        place("b", "cafe", "Near cafe", 100),
        place("c", "college", "College", 1500),
        place("d", "cafe", "Too far", 2500),
      ],
      origin,
    );
    expect(result.map((p) => p.id)).toEqual(["c", "b", "a"]);
    expect(result[1]!.straight_line_m).toBeGreaterThanOrEqual(99);
    expect(result[1]!.straight_line_m).toBeLessThanOrEqual(101);
  });

  it("collapses duplicates of the same name and kind to the nearest", () => {
    const result = selectNearby(
      [place("p1", "metro_station", "Rajiv Chowk", 600), place("p2", "metro_station", "rajiv chowk", 400)],
      origin,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("p2");
  });

  it("keeps at most perKind of each kind", () => {
    const many = Array.from({ length: 10 }, (_, i) => place(`s${i}`, "bus_stop", `Stop ${i}`, 100 + i * 10));
    expect(selectNearby(many, origin, { perKind: 3 }).map((p) => p.id)).toEqual(["s0", "s1", "s2"]);
  });
});
