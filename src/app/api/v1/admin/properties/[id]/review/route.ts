import { z } from "zod";

import { reviewDecisionSchema } from "@/features/admin/schemas";
import { reviewListing } from "@/features/admin/service";
import { createHandler, ok, validationError } from "@/server/http";

const body = z.object({ approve: z.boolean(), reason: z.string().max(500).optional() });

/** POST /api/v1/admin/properties/:id/review — approve or reject (admin_review_property). */
export const POST = createHandler(
  { auth: "staff", label: "admin.review_property", params: z.object({ id: z.uuid() }), body },
  async ({ supabase, user, requestId, params, body: input }) => {
    const decision = reviewDecisionSchema.safeParse({ property_id: params.id, ...input });
    if (!decision.success) throw validationError(decision.error);
    return ok(await reviewListing({ supabase, user, requestId }, decision.data));
  },
);
