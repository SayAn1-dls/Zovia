import "server-only";

import { fetchNominatim, parseNominatimResponse } from "./osm/nominatim";
import { buildOverpassQuery, fetchOverpass, parseOverpassResponse, type OsmPlace } from "./osm/overpass";
import type { GeocodeResult, LatLng } from "./schemas";

/**
 * Geocoding and nearby places behind one interface (spec section 8). The OpenStreetMap
 * implementation needs no key (Nominatim + Overpass); a Google implementation can be added
 * behind the same interface. Callers (the service) add caching and error mapping.
 */
export interface LocationProvider {
  readonly name: "openstreetmap";
  /** Addresses matching free text, best first. */
  geocode(q: string): Promise<GeocodeResult[]>;
  /** Named places of the kinds we show within `radius` metres of `point` (unsorted, no distances). */
  placesAround(point: LatLng, radius: number): Promise<OsmPlace[]>;
}

export function createOpenStreetMapProvider(options: { userAgent: string; referer?: string }): LocationProvider {
  return {
    name: "openstreetmap",
    async geocode(q) {
      return parseNominatimResponse(await fetchNominatim(q, options));
    },
    async placesAround(point, radius) {
      return parseOverpassResponse(await fetchOverpass(buildOverpassQuery(point, radius), options));
    },
  };
}
