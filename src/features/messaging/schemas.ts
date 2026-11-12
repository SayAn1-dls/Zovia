import { z } from "zod";

import type { Database } from "@/lib/database.types";

/** Messaging contracts (isomorphic). Field names are database columns (snake_case). */

type Enums = Database["public"]["Enums"];

export const MESSAGE_MAX_LENGTH = 2000;
export const CHAT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const sendMessageSchema = z
  .object({
    body: z.string().max(MESSAGE_MAX_LENGTH, "Messages can be up to 2,000 characters.").default(""),
    attachment: z
      .object({
        storage_path: z
          .string()
          .max(300)
          .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/, "That attachment is not valid."),
        width: z.number().int().min(1).max(10000).optional(),
        height: z.number().int().min(1).max(10000).optional(),
      })
      .optional(),
  })
  .refine((value) => value.body.trim().length > 0 || value.attachment, {
    path: ["body"],
    message: "Write a message first.",
  });
export type SendMessageInput = z.output<typeof sendMessageSchema>;

export const messagesQuerySchema = z
  .object({
    before: z.iso.datetime({ offset: true }).optional(),
    after: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .refine((value) => !(value.before && value.after), { message: "Use either before or after." });
export type MessagesQuery = z.output<typeof messagesQuerySchema>;

export const startInquirySchema = z.object({ inquiry_id: z.uuid("That enquiry is not valid.") });

export type ChatAttachment = {
  id: string;
  url: string | null;
  mime_type: string;
  width: number | null;
  height: number | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: Enums["message_kind"];
  body: string;
  moderation: Enums["message_moderation"];
  created_at: string;
  attachments: ChatAttachment[];
};

export type ConversationPerson = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
};

export type ConversationListItem = {
  id: string;
  kind: Enums["conversation_kind"];
  status: Enums["conversation_status"];
  title: string;
  subtitle: string | null;
  other: ConversationPerson | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
};

export type ConversationDetail = {
  id: string;
  kind: Enums["conversation_kind"];
  status: Enums["conversation_status"];
  match_id: string | null;
  inquiry_id: string | null;
  property_id: string | null;
  property_title: string | null;
  me: string;
  my_role: string;
  other: ConversationPerson | null;
  other_last_read_at: string | null;
  /** True when the caller has blocked the other person. */
  blocked_by_me: boolean;
};

export type MessagesPage = { messages: ChatMessage[]; has_more: boolean };

export type SendResult =
  | { status: "sent"; message: ChatMessage }
  | {
      status: "blocked";
      kinds: ("phone" | "email" | "social")[];
      restricted: boolean;
      violations: number;
      threshold: number;
      warning: string;
    };

/** Copy shown when a message with contact details was not delivered. */
export function contactWarning(result: { kinds: readonly string[]; restricted: boolean }): string {
  const what = result.kinds.includes("phone")
    ? "phone numbers"
    : result.kinds.includes("email")
      ? "e-mail addresses"
      : "social media handles";
  return result.restricted
    ? `Not sent. You shared contact details several times, so messaging is paused for a while. You can appeal this decision.`
    : `Not sent. For everyone's safety, ${what} and other contact details can't be shared in roommate chats. Meet on ZUVIO first.`;
}
