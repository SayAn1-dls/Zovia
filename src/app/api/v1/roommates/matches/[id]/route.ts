import { z } from "zod";

import { unmatch } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** DELETE /api/v1/roommates/matches/:id: unmatch (closes the chat). */
export const DELETE = createHandler(
  { auth: "user", label: "roommates.unmatch", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => {
    await unmatch({ supabase, user, requestId }, params.id);
    return ok({ unmatched: true });
  },
);
