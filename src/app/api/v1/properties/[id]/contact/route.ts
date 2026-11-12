import { propertyIdParamsSchema } from "@/features/properties/schemas";
import { revealOwnerContact } from "@/features/properties/service";
import { createHandler, ok } from "@/server/http";

/**
 * POST /api/v1/properties/{id}/contact: the owner's phone / WhatsApp for a published listing.
 * Signed-in, active accounts only; `reveal_owner_contact()` re-checks, caps reveals per day and
 * records the reveal.
 */
export const POST = createHandler(
  { auth: "user", rateLimit: "mutation", label: "properties.contact", params: propertyIdParamsSchema },
  async ({ supabase, user, requestId, params }) =>
    ok(await revealOwnerContact({ supabase, user, requestId }, params.id)),
);
