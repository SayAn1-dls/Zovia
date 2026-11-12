import { z } from "zod";

import { getConversation } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/conversations/:id: header details of one of the caller's conversations. */
export const GET = createHandler(
  { auth: "user", label: "conversations.get", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => ok(await getConversation({ supabase, user, requestId }, params.id)),
);
