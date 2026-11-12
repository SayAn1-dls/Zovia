import { nearbyQuerySchema } from "@/features/locations/schemas";
import { getNearbyPlaces } from "@/features/locations/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/locations/nearby?lat=&lng=: named places within 2 km (OpenStreetMap Overpass,
 * cached per area for days), with straight-line distances. Public, rate limited per IP, limited
 * to points inside India so it cannot be used as a general Overpass proxy.
 */
export const GET = createHandler(
  { auth: "public", rateLimit: { max: 30, windowSeconds: 60 }, label: "locations.nearby", query: nearbyQuerySchema },
  async ({ query }) =>
    ok(await getNearbyPlaces({ lat: query.lat, lng: query.lng }), {
      // Same answer for everyone; browsers may keep it briefly.
      headers: { "Cache-Control": "public, max-age=3600" },
    }),
);
