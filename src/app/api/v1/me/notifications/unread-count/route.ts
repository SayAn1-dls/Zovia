import { unreadCount } from "@/features/notifications/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/me/notifications/unread-count: for the header bell. */
export const GET = createHandler(
  { auth: "user", allowSuspended: true, label: "me.notifications.unread" },
  async ({ supabase, user, requestId }) => ok(await unreadCount({ supabase, user, requestId })),
);
