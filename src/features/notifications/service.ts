import "server-only";

import type { UserServiceContext } from "@/server/auth/context";

import * as repo from "./repository";
import { safeLinkPath, type MarkReadInput, type NotificationsPage, type NotificationsQuery } from "./schemas";

export async function listNotifications(ctx: UserServiceContext, query: NotificationsQuery): Promise<NotificationsPage> {
  const [rows, unread] = await Promise.all([
    repo.fetchNotifications(ctx.supabase, ctx.user.id, {
      before: query.before,
      limit: query.limit,
      unreadOnly: query.unread,
    }),
    repo.countUnread(ctx.supabase, ctx.user.id),
  ]);
  return {
    items: rows.slice(0, query.limit).map((row) => ({ ...row, link_path: safeLinkPath(row.link_path) })),
    unread_count: unread,
    has_more: rows.length > query.limit,
  };
}

export async function unreadCount(ctx: UserServiceContext): Promise<{ unread_count: number }> {
  return { unread_count: await repo.countUnread(ctx.supabase, ctx.user.id) };
}

export async function markRead(ctx: UserServiceContext, input: MarkReadInput): Promise<{ marked: number }> {
  return { marked: await repo.callMarkRead(ctx.supabase, input.ids) };
}
