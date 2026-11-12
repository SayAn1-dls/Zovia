import { listQuestions } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/roommates/questions: the lifestyle questionnaire (reference data). */
export const GET = createHandler({ auth: "user", label: "roommates.questions" }, async ({ supabase, user, requestId }) =>
  ok(await listQuestions({ supabase, user, requestId })),
);
