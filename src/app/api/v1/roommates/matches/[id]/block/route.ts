import { z } from "zod";

import { blockMatch } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/roommates/matches/:id/block: block the other person of a match. */
export const POST = createHandler(
  { auth: "user", label: "roommates.block", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => {
    await blockMatch({ supabase, user, requestId }, params.id);
    return ok({ blocked: true });
  },
);
