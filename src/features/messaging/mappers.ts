import { contactWarning, type ChatMessage, type SendResult } from "./schemas";

/** Pure mapping helpers for messaging (unit-tested). */

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  kind: ChatMessage["kind"];
  body: string;
  moderation: ChatMessage["moderation"];
  created_at: string;
  message_attachments?: { id: string; storage_path: string; mime_type: string; width: number | null; height: number | null }[] | null;
};

export function attachmentPaths(rows: readonly MessageRow[]): string[] {
  return rows.flatMap((row) => (row.message_attachments ?? []).map((attachment) => attachment.storage_path));
}

export function toChatMessage(row: MessageRow, urls: ReadonlyMap<string, string>): ChatMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    kind: row.kind,
    body: row.body,
    moderation: row.moderation,
    created_at: row.created_at,
    attachments: (row.message_attachments ?? []).map((attachment) => ({
      id: attachment.id,
      url: urls.get(attachment.storage_path) ?? null,
      mime_type: attachment.mime_type,
      width: attachment.width,
      height: attachment.height,
    })),
  };
}

/**
 * Turns a page fetched with `limit + 1` rows into chronological messages plus `has_more`.
 * `newestFirst` is true for "before" / initial pages (fetched descending).
 */
export function toPage<T>(rows: readonly T[], limit: number, newestFirst: boolean): { items: T[]; has_more: boolean } {
  const has_more = rows.length > limit;
  const page = rows.slice(0, limit);
  return { items: newestFirst ? [...page].reverse() : page, has_more };
}

const KINDS = new Set(["phone", "email", "social"]);

/** Validates the jsonb returned by send_message(). Throws on an unexpected shape. */
export function parseSendResult(raw: unknown, urls: ReadonlyMap<string, string> = new Map()): SendResult {
  if (!raw || typeof raw !== "object") throw new Error("send_message returned nothing");
  const value = raw as Record<string, unknown>;
  if (value.status === "blocked") {
    const kinds = (Array.isArray(value.kinds) ? value.kinds : []).filter(
      (kind): kind is "phone" | "email" | "social" => typeof kind === "string" && KINDS.has(kind),
    );
    const restricted = value.restricted === true;
    return {
      status: "blocked",
      kinds,
      restricted,
      violations: typeof value.violations === "number" ? value.violations : 1,
      threshold: typeof value.threshold === "number" ? value.threshold : 3,
      warning: contactWarning({ kinds, restricted }),
    };
  }
  if (value.status === "sent" && value.message && typeof value.message === "object") {
    const message = value.message as Record<string, unknown>;
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    return {
      status: "sent",
      message: toChatMessage(
        {
          id: String(message.id),
          conversation_id: String(message.conversation_id),
          sender_id: typeof message.sender_id === "string" ? message.sender_id : null,
          kind: message.kind as ChatMessage["kind"],
          body: typeof message.body === "string" ? message.body : "",
          moderation: (message.moderation as ChatMessage["moderation"]) ?? "clean",
          created_at: String(message.created_at),
          message_attachments: attachments.map((item) => {
            const a = item as Record<string, unknown>;
            return {
              id: String(a.id),
              storage_path: String(a.storage_path),
              mime_type: String(a.mime_type),
              width: typeof a.width === "number" ? a.width : null,
              height: typeof a.height === "number" ? a.height : null,
            };
          }),
        },
        urls,
      ),
    };
  }
  throw new Error("send_message returned an unexpected shape");
}
