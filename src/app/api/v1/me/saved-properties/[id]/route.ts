import { propertyIdParamsSchema } from "@/features/properties/schemas";
import { unsaveProperty } from "@/features/properties/service";
import { createHandler, ok } from "@/server/http";

/** DELETE /api/v1/me/saved-properties/{property_id}: remove a listing from the caller's saved list. */
export const DELETE = createHandler(
  { auth: "user", rateLimit: "mutation", label: "me.saved_properties.remove", params: propertyIdParamsSchema },
  async ({ supabase, user, requestId, params }) => ok(await unsaveProperty({ supabase, user, requestId }, params.id)),
);
