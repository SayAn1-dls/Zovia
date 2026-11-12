import { z } from "zod";

import { blockOtherMember } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/conversations/:id/block: block the other member (target derived server-side). */
export const POST = createHandler(
  { auth: "user", label: "conversations.block", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => {
    await blockOtherMember({ supabase, user, requestId }, params.id);
    return ok({ blocked: true });
  },
);
