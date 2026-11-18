import { googlePhotoQuerySchema } from "@/features/locations/schemas";
import { getGooglePlacePhoto } from "@/features/locations/service";
import { createHandler } from "@/server/http";

/**
 * GET /api/v1/locations/google-photo?name=places/<id>/photos/<id>: the bytes of a Google Places
 * photo, fetched server-side so GOOGLE_MAPS_API_KEY never reaches the browser. 404 when Google
 * is not configured. Public, but only photo names this server signed are served (HMAC `sig`, see
 * photo-token.ts), and it is rate limited to 20 a minute per IP: the Google call is paid.
 */
export const GET = createHandler(
  {
    auth: "public",
    rateLimit: { max: 20, windowSeconds: 60 },
    label: "locations.google_photo",
    query: googlePhotoQuerySchema,
  },
  async ({ query }) => {
    const photo = await getGooglePlacePhoto(query.name, query.sig);
    return new Response(photo.body, {
      headers: {
        "Content-Type": photo.contentType,
        // Short browser cache only; Google's terms do not allow us to store the image.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
