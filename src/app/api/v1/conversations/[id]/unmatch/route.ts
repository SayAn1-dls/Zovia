import { z } from "zod";

import { unmatchConversation } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/conversations/:id/unmatch: end the roommate match behind this chat. */
export const POST = createHandler(
  { auth: "user", label: "conversations.unmatch", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => {
    await unmatchConversation({ supabase, user, requestId }, params.id);
    return ok({ unmatched: true });
  },
);
