import { z } from "zod";

import { messagesQuerySchema, sendMessageSchema } from "@/features/messaging/schemas";
import { listMessages, sendMessage } from "@/features/messaging/service";
import { createHandler, ok } from "@/server/http";

const params = z.object({ id: z.uuid() });

/** GET /api/v1/conversations/:id/messages?before=|after=&limit=: history, chronological. */
export const GET = createHandler(
  { auth: "user", label: "conversations.messages", params, query: messagesQuerySchema },
  async ({ supabase, user, requestId, params, query }) => {
    const page = await listMessages({ supabase, user, requestId }, params.id, query);
    return ok(page.messages, { meta: { next_cursor: page.has_more ? (page.messages[0]?.created_at ?? null) : null } });
  },
);

/**
 * POST /api/v1/conversations/:id/messages: send through send_message(). A message carrying
 * contact details in a roommate chat comes back as { status: "blocked", warning } and is not
 * delivered (200, so the client can show the warning without treating it as a failure).
 */
export const POST = createHandler(
  { auth: "user", label: "conversations.send", rateLimit: { max: 40, windowSeconds: 60 }, params, body: sendMessageSchema },
  async ({ supabase, user, requestId, params, body }) => ok(await sendMessage({ supabase, user, requestId }, params.id, body)),
);
