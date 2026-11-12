import { z } from "zod";

import { messageReportSchema } from "@/features/moderation/schemas";
import { reportMessage } from "@/features/moderation/service";
import { createHandler, created } from "@/server/http";

/** POST /api/v1/messages/:id/report: a member reports another person's message. */
export const POST = createHandler(
  { auth: "user", label: "messages.report", params: z.object({ id: z.uuid() }), body: messageReportSchema },
  async ({ supabase, user, requestId, params, body }) =>
    created(await reportMessage({ supabase, user, requestId }, params.id, body)),
);
