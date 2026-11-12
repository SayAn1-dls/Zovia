import { z } from "zod";

import type { SearchResultItem } from "@/features/properties/schemas";

/**
 * AI accommodation assistant contracts (isomorphic). The browser keeps a short conversation
 * history and sends it with each turn; the server caps every size again.
 */

/** Turns of history the client keeps and the server accepts (user + assistant messages). */
export const MAX_HISTORY_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 800;
export const MAX_HISTORY_MESSAGE_CHARS = 1500;
/** Property cards shown under one answer. */
export const MAX_RESULT_CARDS = 6;

export const ASSISTANT_MODES = ["ai", "basic"] as const;
export type AssistantMode = (typeof ASSISTANT_MODES)[number];

const trimmed = (max: number) =>
  z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(max));

export const historyMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  // Older turns are trimmed instead of rejected: they are context, not commands.
  content: z
    .string()
    .transform((value) => value.replace(/\s+/g, " ").trim().slice(0, MAX_HISTORY_MESSAGE_CHARS))
    .pipe(z.string().min(1)),
});
export type HistoryMessage = z.output<typeof historyMessageSchema>;

export const chatRequestSchema = z.object({
  message: trimmed(MAX_MESSAGE_CHARS),
  history: z
    .array(historyMessageSchema)
    .max(40)
    .default([])
    .transform((list) => list.slice(-MAX_HISTORY_MESSAGES)),
});
export type ChatRequest = z.input<typeof chatRequestSchema>;
export type ChatInput = z.output<typeof chatRequestSchema>;

/** A listing card under an answer. Built only from database rows returned by our tools. */
export type AssistantPropertyCard = Pick<
  SearchResultItem,
  | "id"
  | "slug"
  | "title"
  | "property_type"
  | "listing_mode"
  | "locality"
  | "city"
  | "price_from"
  | "available_beds"
  | "total_beds"
  | "cover_url"
  | "rating_avg"
  | "rating_count"
> &
  Partial<Pick<SearchResultItem, "recently_confirmed" | "availability_status" | "available_from">>;

/** The structured final answer the model gives through `present_results`. */
export const presentResultsSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  property_ids: z.array(z.string()).max(20).default([]),
  alternatives: z.boolean().default(false),
  follow_up_question: z.string().trim().max(300).nullish(),
});
export type PresentResults = z.output<typeof presentResultsSchema>;

export type AssistantReply = {
  mode: AssistantMode;
  message: string;
  /** Cards in the order the assistant chose; every one is a database row from this turn. */
  properties: AssistantPropertyCard[];
  /** True when the cards are not exact matches (shown under an "alternatives" label). */
  alternatives: boolean;
  follow_up_question: string | null;
  /** Basic mode: the filters understood from the message, for a "see all results" link. */
  search_query: Record<string, string | string[]> | null;
};

export type AssistantStatus = { mode: AssistantMode };
