import { z } from "zod";

import { getDeck } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/roommates/candidates: the caller's ranked deck (pool from roommate_candidates(),
 * deal-breakers and scoring by the compatibility engine with weights from the database).
 */
export const GET = createHandler(
  {
    auth: "user",
    label: "roommates.candidates",
    rateLimit: "search",
    query: z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) }),
  },
  async ({ supabase, user, requestId, query }) => ok(await getDeck({ supabase, user, requestId }, query.limit)),
);
