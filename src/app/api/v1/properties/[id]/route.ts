import { propertyRefSchema } from "@/features/properties/schemas";
import { getPublicProperty } from "@/features/properties/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/properties/{id}: a published listing by id or slug, with rooms, beds, photos,
 * amenities, rules, charges, availability, the owner card (never contact details), the three
 * trust signals and recent reviews. Public and cookieless.
 */
export const GET = createHandler(
  { auth: "public", rateLimit: "search", label: "properties.detail", params: propertyRefSchema },
  async ({ params }) => ok(await getPublicProperty(params.id)),
);
