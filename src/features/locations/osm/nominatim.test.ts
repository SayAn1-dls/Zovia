import { describe, expect, it } from "vitest";

import { buildNominatimUrl, normaliseGeocodeQuery, parseNominatimResponse } from "./nominatim";

describe("normaliseGeocodeQuery", () => {
  it("is a stable cache key", () => {
    expect(normaliseGeocodeQuery("  Sector 14,   Sonipat ")).toBe("sector 14, sonipat");
  });
});

describe("buildNominatimUrl", () => {
  it("limits results to India and asks for address details", () => {
    const url = new URL(buildNominatimUrl("koramangala"));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("countrycodes")).toBe("in");
    expect(url.searchParams.get("format")).toBe("jsonv2");
    expect(url.searchParams.get("addressdetails")).toBe("1");
  });
});

describe("parseNominatimResponse", () => {
  it("normalises results and drops items without coordinates", () => {
    const results = parseNominatimResponse([
      {
        lat: "12.9352",
        lon: "77.6245",
        display_name: "Koramangala, Bengaluru, Karnataka, 560034, India",
        address: { suburb: "Koramangala", city: "Bengaluru", state: "Karnataka", postcode: "560 034" },
      },
      { lat: "x", lon: "77" },
    ]);
    expect(results).toEqual([
      {
        label: "Koramangala, Bengaluru, Karnataka, 560034, India",
        lat: 12.9352,
        lng: 77.6245,
        locality: "Koramangala",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560034",
        source: "openstreetmap",
      },
    ]);
  });

  it("drops invalid PIN codes rather than passing them on", () => {
    const [result] = parseNominatimResponse([{ lat: "28.99", lon: "77.01", address: { postcode: "ABC" } }]);
    expect(result?.pincode).toBeNull();
  });

  it("throws on an unexpected shape", () => {
    expect(() => parseNominatimResponse({ error: "x" })).toThrow();
  });
});
