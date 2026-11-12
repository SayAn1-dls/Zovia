import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

/**
 * Conversations and messages through the caller's session. RLS shows a conversation, its members
 * and its messages only to members; messages are never written here directly (no grant) — every
 * send goes through send_message().
 */

export const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";

type Functions = Database["public"]["Functions"];
export type ConversationRow = Functions["my_conversations"]["Returns"][number];

export async function callMyConversations(
  supabase: AppSupabaseClient,
  limit: number,
  offset: number,
): Promise<ConversationRow[]> {
  const { data, error } = await supabase.rpc("my_conversations", { p_limit: limit, p_offset: offset });
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function fetchConversation(supabase: AppSupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, kind, status, match_id, inquiry_id, property_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function fetchMembers(supabase: AppSupabaseClient, conversationId: string) {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id, role, last_read_at, left_at")
    .eq("conversation_id", conversationId);
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function fetchPropertyTitle(supabase: AppSupabaseClient, propertyId: string): Promise<string | null> {
  const { data, error } = await supabase.from("properties").select("title").eq("id", propertyId).maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data?.title ?? null;
}

export async function fetchPublicCard(supabase: AppSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("public_user_cards")
    .select("user_id, display_name, avatar_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function hasBlocked(supabase: AppSupabaseClient, blockerId: string, blockedId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data !== null;
}

const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, kind, body, moderation, created_at, message_attachments(id, storage_path, mime_type, width, height)";

export async function fetchMessages(
  supabase: AppSupabaseClient,
  conversationId: string,
  options: { before?: string; after?: string; limit: number },
) {
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);
  if (options.after) {
    query = query.gt("created_at", options.after).order("created_at", { ascending: true }).order("id", { ascending: true });
  } else {
    if (options.before) query = query.lt("created_at", options.before);
    query = query.order("created_at", { ascending: false }).order("id", { ascending: false });
  }
  const { data, error } = await query.limit(options.limit + 1);
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function callSendMessage(
  supabase: AppSupabaseClient,
  conversationId: string,
  body: string,
  attachment: { storage_path: string; width?: number; height?: number } | undefined,
): Promise<unknown> {
  const { data, error } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_body: body,
    ...(attachment ? { p_attachment: attachment } : {}),
  });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function callMarkRead(supabase: AppSupabaseClient, conversationId: string): Promise<string> {
  const { data, error } = await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function callStartInquiryConversation(supabase: AppSupabaseClient, inquiryId: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_inquiry_conversation", { p_inquiry_id: inquiryId });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function signAttachmentUrls(
  supabase: AppSupabaseClient,
  paths: string[],
  expiresInSeconds: number,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.storage.from(CHAT_ATTACHMENTS_BUCKET).createSignedUrls(unique, expiresInSeconds);
  if (error) throw fromSupabaseError(error);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) map.set(item.path, item.signedUrl);
  }
  return map;
}
