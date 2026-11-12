import { notificationsQuerySchema } from "@/features/notifications/schemas";
import { listNotifications } from "@/features/notifications/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/me/notifications?before=&limit=&unread=: the caller's notifications, newest first. */
export const GET = createHandler(
  { auth: "user", allowSuspended: true, label: "me.notifications", query: notificationsQuerySchema },
  async ({ supabase, user, requestId, query }) => {
    const page = await listNotifications({ supabase, user, requestId }, query);
    const last = page.items.at(-1);
    return ok(page, { meta: { next_cursor: page.has_more && last ? last.created_at : null } });
  },
);
