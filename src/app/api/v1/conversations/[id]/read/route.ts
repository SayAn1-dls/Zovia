import { z } from "zod";

import { markRead } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/conversations/:id/read: read receipt (sets the caller's last_read_at). */
export const POST = createHandler(
  { auth: "user", label: "conversations.read", rateLimit: { max: 120, windowSeconds: 60 }, params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => ok(await markRead({ supabase, user, requestId }, params.id)),
);
