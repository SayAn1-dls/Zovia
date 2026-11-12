import { markReadSchema } from "@/features/notifications/schemas";
import { markRead } from "@/features/notifications/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/me/notifications/read { ids? }: mark some (or all) of the caller's notifications read. */
export const POST = createHandler(
  { auth: "user", allowSuspended: true, label: "me.notifications.read", body: markReadSchema },
  async ({ supabase, user, requestId, body }) => ok(await markRead({ supabase, user, requestId }, body)),
);
