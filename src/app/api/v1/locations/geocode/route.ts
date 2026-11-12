import { geocodeQuerySchema } from "@/features/locations/schemas";
import { geocodeAddress } from "@/features/locations/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/locations/geocode?q=: addresses in India matching `q` (OpenStreetMap Nominatim,
 * cached). Signed-in users only (the owner portal uses it to place a listing's pin), rate limited
 * per user; the provider's 1 request/second policy is also respected server-side.
 */
export const GET = createHandler(
  { auth: "user", rateLimit: { max: 20, windowSeconds: 60 }, label: "locations.geocode", query: geocodeQuerySchema },
  async ({ query }) => ok(await geocodeAddress(query.q)),
);
