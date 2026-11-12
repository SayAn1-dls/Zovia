import { reportSchema } from "@/features/moderation/schemas";
import { submitReport } from "@/features/moderation/service";
import { createHandler, created } from "@/server/http";

/** POST /api/v1/reports: report a user, roommate profile, listing, review or message. */
export const POST = createHandler(
  { auth: "user", label: "reports.submit", body: reportSchema },
  async ({ supabase, user, requestId, body }) => created(await submitReport({ supabase, user, requestId }, body)),
);
