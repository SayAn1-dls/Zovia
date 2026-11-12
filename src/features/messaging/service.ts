import "server-only";

import { blockUser } from "@/features/moderation/service";
import { unmatch } from "@/features/roommates/service";
import type { UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";

import { attachmentPaths, parseSendResult, toChatMessage, toPage } from "./mappers";
import * as repo from "./repository";
import type {
  ConversationDetail,
  ConversationListItem,
  ConversationPerson,
  MessagesPage,
  MessagesQuery,
  SendMessageInput,
  SendResult,
} from "./schemas";

const SIGNED_URL_SECONDS = 60 * 60;

function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const base = env().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function person(
  card: { user_id: string | null; display_name: string | null; avatar_path: string | null } | null,
): ConversationPerson | null {
  if (!card?.user_id) return null;
  return { user_id: card.user_id, display_name: card.display_name ?? "Member", avatar_url: avatarUrl(card.avatar_path) };
}

export async function listConversations(
  ctx: UserServiceContext,
  page: { limit: number; offset: number },
): Promise<{ items: ConversationListItem[]; has_more: boolean }> {
  const rows = await repo.callMyConversations(ctx.supabase, page.limit + 1, page.offset);
  const { items, has_more } = toPage(rows, page.limit, false);
  return {
    has_more,
    items: items.map((row) => {
      const other = person({
        user_id: row.other_user_id,
        display_name: row.other_display_name,
        avatar_path: row.other_avatar_path,
      });
      const isInquiry = row.kind === "property_inquiry";
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        title: other?.display_name ?? "Former member",
        subtitle: isInquiry ? (row.property_title ? `Enquiry · ${row.property_title}` : "Property enquiry") : "Roommate match",
        other,
        last_message_at: row.last_message_at,
        last_message_preview: row.last_message_preview,
        unread_count: row.unread_count ?? 0,
      };
    }),
  };
}

export async function getConversation(ctx: UserServiceContext, conversationId: string): Promise<ConversationDetail> {
  const [conversation, members] = await Promise.all([
    repo.fetchConversation(ctx.supabase, conversationId),
    repo.fetchMembers(ctx.supabase, conversationId),
  ]);
  const mine = members.find((member) => member.user_id === ctx.user.id && member.left_at === null);
  if (!conversation || !mine) throw errors.notFound("Conversation not found.");
  const otherMember = members.find((member) => member.user_id !== ctx.user.id) ?? null;
  const [card, propertyTitle, blocked] = await Promise.all([
    otherMember ? repo.fetchPublicCard(ctx.supabase, otherMember.user_id) : Promise.resolve(null),
    conversation.property_id ? repo.fetchPropertyTitle(ctx.supabase, conversation.property_id) : Promise.resolve(null),
    otherMember ? repo.hasBlocked(ctx.supabase, ctx.user.id, otherMember.user_id) : Promise.resolve(false),
  ]);
  return {
    id: conversation.id,
    kind: conversation.kind,
    status: conversation.status,
    match_id: conversation.match_id,
    inquiry_id: conversation.inquiry_id,
    property_id: conversation.property_id,
    property_title: propertyTitle,
    me: ctx.user.id,
    my_role: mine.role,
    other: person(card) ?? (otherMember ? { user_id: otherMember.user_id, display_name: "Former member", avatar_url: null } : null),
    other_last_read_at: otherMember?.last_read_at ?? null,
    blocked_by_me: blocked,
  };
}

export async function listMessages(
  ctx: UserServiceContext,
  conversationId: string,
  query: MessagesQuery,
): Promise<MessagesPage> {
  const rows = await repo.fetchMessages(ctx.supabase, conversationId, query);
  if (rows.length === 0 && !query.before && !query.after) {
    // Distinguish "no messages" from "not a member" (RLS returns nothing either way).
    const conversation = await repo.fetchConversation(ctx.supabase, conversationId);
    if (!conversation) throw errors.notFound("Conversation not found.");
  }
  const { items, has_more } = toPage(rows, query.limit, !query.after);
  const urls = await repo.signAttachmentUrls(ctx.supabase, attachmentPaths(items), SIGNED_URL_SECONDS);
  return { messages: items.map((row) => toChatMessage(row, urls)), has_more };
}

export async function sendMessage(
  ctx: UserServiceContext,
  conversationId: string,
  input: SendMessageInput,
): Promise<SendResult> {
  const raw = await repo.callSendMessage(ctx.supabase, conversationId, input.body, input.attachment);
  const paths = input.attachment ? [input.attachment.storage_path] : [];
  const urls = await repo.signAttachmentUrls(ctx.supabase, paths, SIGNED_URL_SECONDS);
  try {
    return parseSendResult(raw, urls);
  } catch (cause) {
    throw errors.internal(undefined, { cause });
  }
}

export async function markRead(ctx: UserServiceContext, conversationId: string): Promise<{ last_read_at: string }> {
  return { last_read_at: await repo.callMarkRead(ctx.supabase, conversationId) };
}

export async function startInquiryConversation(
  ctx: UserServiceContext,
  inquiryId: string,
): Promise<{ conversation_id: string }> {
  return { conversation_id: await repo.callStartInquiryConversation(ctx.supabase, inquiryId) };
}

/** Blocks the other member. The target comes from the membership rows, never from the client. */
export async function blockOtherMember(ctx: UserServiceContext, conversationId: string): Promise<void> {
  const members = await repo.fetchMembers(ctx.supabase, conversationId);
  if (!members.some((member) => member.user_id === ctx.user.id)) throw errors.notFound("Conversation not found.");
  const other = members.find((member) => member.user_id !== ctx.user.id);
  if (!other) throw errors.conflict("There is nobody else in this conversation.");
  await blockUser(ctx, other.user_id);
}

/** Ends the roommate match behind a conversation. */
export async function unmatchConversation(ctx: UserServiceContext, conversationId: string): Promise<void> {
  const conversation = await repo.fetchConversation(ctx.supabase, conversationId);
  if (!conversation) throw errors.notFound("Conversation not found.");
  if (!conversation.match_id) throw errors.badRequest("Only roommate matches can be ended.");
  await unmatch(ctx, conversation.match_id);
}
