import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

import type { NotificationItem } from "./schemas";

/** The caller's own notifications (RLS: own rows only). Created only by database functions. */

export async function fetchNotifications(
  supabase: AppSupabaseClient,
  userId: string,
  options: { before?: string; limit: number; unreadOnly: boolean },
): Promise<NotificationItem[]> {
  let query = supabase
    .from("notifications")
    .select("id, type, title, body, link_path, read_at, created_at")
    .eq("user_id", userId);
  if (options.before) query = query.lt("created_at", options.before);
  if (options.unreadOnly) query = query.is("read_at", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(options.limit + 1);
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function countUnread(supabase: AppSupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw fromSupabaseError(error);
  return count ?? 0;
}

export async function callMarkRead(supabase: AppSupabaseClient, ids: string[] | undefined): Promise<number> {
  const { data, error } = await supabase.rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
  if (error) throw fromSupabaseError(error);
  return data ?? 0;
}
