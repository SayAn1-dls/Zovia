import { describe, expect, it } from "vitest";

import { buildHousingQuery, parseHousingResponse } from "./housing";

const el = (id: number, tags: Record<string, string>) => ({ type: "node", id, lat: 12.93, lon: 77.62, tags });

describe("OSM housing", () => {
  it("builds an around query for hostels, guest houses and dormitories", () => {
    const q = buildHousingQuery({ lat: 12.9716, lng: 77.5946 });
    expect(q).toContain('"tourism"~"^(hostel|guest_house)$"');
    expect(q).toContain("around:3500,12.97160,77.59460");
  });

  it("keeps named long-stay places, drops hotels/holiday homes and unnamed ones", () => {
    const places = parseHousingResponse({
      elements: [
        el(1, { tourism: "hostel", name: "Akshaya Ladies Hostel", "addr:street": "1st Main" }),
        el(2, { tourism: "guest_house", name: "Canara Bank Holiday Home" }),
        el(3, { tourism: "guest_house", name: "Sri Sai PG for Gents", phone: "+91 98450 00000;+91 1" }),
        el(4, { tourism: "hostel" }),
        el(5, { tourism: "guest_house", name: "Hotel Comfort Inn" }),
        el(6, { building: "dormitory", name: "Block C Dorm", website: "example.org" }),
      ],
    });
    expect(places.map((p) => [p.name, p.kind])).toEqual([
      ["Sri Sai PG for Gents", "pg"],
      ["Akshaya Ladies Hostel", "hostel"],
      ["Block C Dorm", "dormitory"],
    ]);
    expect(places[0]?.phone).toBe("+91 98450 00000");
    expect(places[1]?.address).toBe("1st Main");
    expect(places[2]?.website).toBe("https://example.org/");
    expect(places[1]?.osm_url).toBe("https://www.openstreetmap.org/node/1");
  });

  it("rejects malformed responses", () => {
    expect(() => parseHousingResponse({})).toThrow();
  });
});
