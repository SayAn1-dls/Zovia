import { describe, expect, it } from "vitest";

import { buildTextSearchBody, parseTextSearchResponse } from "./places";

describe("buildTextSearchBody", () => {
  it("searches PGs and hostels in the city, India only", () => {
    expect(buildTextSearchBody("Pune")).toMatchObject({ textQuery: "PG and hostels in Pune", regionCode: "IN" });
  });
});

describe("parseTextSearchResponse", () => {
  it("maps places with photo names and attributions", () => {
    const places = parseTextSearchResponse({
      places: [
        {
          id: "ChIJabc",
          displayName: { text: "Sunrise PG" },
          formattedAddress: "Kothrud, Pune",
          rating: 4.2,
          userRatingCount: 37,
          googleMapsUri: "https://maps.google.com/?cid=1",
          photos: [
            {
              name: "places/ChIJabc/photos/Xyz_1",
              authorAttributions: [{ displayName: "A. Kumar", uri: "//maps.google.com/maps/contrib/1" }],
            },
          ],
        },
        { id: "no-name" },
      ],
    });
    expect(places).toEqual([
      {
        place_id: "ChIJabc",
        name: "Sunrise PG",
        address: "Kothrud, Pune",
        rating: 4.2,
        rating_count: 37,
        maps_url: "https://maps.google.com/?cid=1",
        photo: {
          name: "places/ChIJabc/photos/Xyz_1",
          attributions: [{ name: "A. Kumar", uri: "https://maps.google.com/maps/contrib/1" }],
        },
      },
    ]);
  });

  it("returns an empty list when Google finds nothing", () => {
    expect(parseTextSearchResponse({})).toEqual([]);
  });

  it("never passes on a non-https link or an unexpected photo name", () => {
    const [place] = parseTextSearchResponse({
      places: [
        {
          id: "x",
          displayName: { text: "X" },
          googleMapsUri: "javascript:alert(1)",
          photos: [{ name: "../../etc/passwd" }],
        },
      ],
    });
    expect(place?.maps_url).toBeNull();
    expect(place?.photo).toBeNull();
  });
});
