import { z } from "zod";

import { listConversations } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/conversations?page=&limit=: the caller's conversations, newest activity first. */
export const GET = createHandler(
  {
    auth: "user",
    label: "conversations.list",
    query: z.object({
      page: z.coerce.number().int().min(1).max(1000).default(1),
      limit: z.coerce.number().int().min(1).max(50).default(30),
    }),
  },
  async ({ supabase, user, requestId, query }) =>
    ok(
      await listConversations(
        { supabase, user, requestId },
        { limit: query.limit, offset: (query.page - 1) * query.limit },
      ),
    ),
);
