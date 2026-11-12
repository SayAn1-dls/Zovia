import { chatRequestSchema } from "@/features/assistant/schemas";
import { chat } from "@/features/assistant/service";
import { createHandler, ok } from "@/server/http";

/**
 * POST /api/v1/assistant/chat: one assistant turn for the signed-in user. Body:
 * `{ message, history?: [{ role, content }] }` (the last 10 turns are used). Returns
 * `{ mode, message, properties[], alternatives, follow_up_question, search_query }`; every
 * property card is a published listing a database tool returned in this turn.
 */
export const POST = createHandler(
  { auth: "user", rateLimit: "assistant", label: "assistant.chat", body: chatRequestSchema, maxBodyBytes: 40_000 },
  async ({ supabase, user, requestId, body }) => ok(await chat({ supabase, user, requestId }, body)),
);
