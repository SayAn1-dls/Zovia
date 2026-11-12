import { inquirySchema, propertyIdParamsSchema } from "@/features/properties/schemas";
import { sendInquiry } from "@/features/properties/service";
import { created, createHandler } from "@/server/http";

/**
 * POST /api/v1/properties/{id}/inquiries: send the owner an enquiry (never a booking).
 * Body: { message, move_in_date?, occupants, room_id? }. `create_property_inquiry()` re-checks
 * the listing, the caller, the room and the per-user rate limit.
 */
export const POST = createHandler(
  {
    auth: "user",
    rateLimit: "mutation",
    label: "properties.inquiry",
    params: propertyIdParamsSchema,
    body: inquirySchema,
  },
  async ({ supabase, user, requestId, params, body }) =>
    created(await sendInquiry({ supabase, user, requestId }, params.id, body)),
);
