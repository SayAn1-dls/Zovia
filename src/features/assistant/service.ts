import "server-only";

import {
  PROPERTY_TYPE_LABELS,
  parseSearchFilters,
  searchFiltersToQuery,
  type SearchFilters,
} from "@/features/properties/schemas";
import { getSearchReferenceData, searchPublicProperties } from "@/features/properties/service";
import type { UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";
import type { Json } from "@/lib/database.types";

import { AnthropicProvider, anthropicErrorCode } from "./anthropic-provider";
import { describeRequirements, guidanceFor } from "./basic";
import { parseConversation, type ParsedRequirements } from "./parser";
import { selectPresentedCards } from "./present";
import type { AIProvider } from "./provider";
import * as repo from "./repository";
import {
  MAX_RESULT_CARDS,
  type AssistantMode,
  type AssistantReply,
  type AssistantStatus,
  type ChatInput,
} from "./schemas";
import { ASSISTANT_SYSTEM_PROMPT } from "./system-prompt";
import { cardFromSearch, createToolRuntime } from "./tools";

/**
 * AI accommodation assistant (spec section 8).
 *
 * AI mode (AI_PROVIDER=anthropic + AI_PROVIDER_API_KEY): the model calls our database tools as
 * the caller and answers through `present_results`; cards are built only from rows those tools
 * returned in this turn. Basic mode (no key, or the provider failing): a rule-based reader runs
 * the same property search. Every call is checked against a per-user daily quota and logged to
 * ai_usage_logs.
 */

/** Per-user daily assistant turns (Postgres consume_rate_limit; see report for a settings key). */
export const ASSISTANT_DAILY_LIMIT = 50;
const DAY_SECONDS = 86_400;
const FEATURE = "assistant.chat";
const BASIC_PROVIDER = { provider: "basic", model: "rules-v1" } as const;

export function getAIProvider(): AIProvider | null {
  const config = env();
  const name = (config.AI_PROVIDER ?? "anthropic").trim().toLowerCase();
  if (!config.AI_PROVIDER_API_KEY || name !== "anthropic") return null;
  return new AnthropicProvider({ apiKey: config.AI_PROVIDER_API_KEY, model: config.AI_MODEL });
}

export function getAssistantStatus(): AssistantStatus {
  return { mode: getAIProvider() ? "ai" : "basic" };
}

async function recordUsage(ctx: UserServiceContext, record: repo.UsageRecord): Promise<void> {
  try {
    await repo.logUsage(ctx.supabase, record);
  } catch (error) {
    logger.warn("assistant.usage_log_failed", { request_id: ctx.requestId, error: serializeError(error) });
  }
}

async function recordSearch(ctx: UserServiceContext, query: string, filters: SearchFilters, total: number) {
  try {
    const params = Object.fromEntries(
      Object.entries(searchFiltersToQuery(filters)).filter(([, value]) => value !== undefined),
    ) as { [key: string]: Json | undefined };
    await repo.insertSearchHistory(ctx.supabase, {
      user_id: ctx.user.id,
      query_text: query.slice(0, 500),
      filters: params,
      result_count: total,
    });
  } catch (error) {
    logger.warn("assistant.search_history_failed", { request_id: ctx.requestId, error: serializeError(error) });
  }
}

function toQuery(filters: SearchFilters): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(searchFiltersToQuery(filters))) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.map(String) : String(value);
  }
  return out;
}

// ───────────────────────────── basic mode ─────────────────────────────

export function filtersFromRequirements(req: ParsedRequirements): SearchFilters {
  return parseSearchFilters({
    city: req.city ?? undefined,
    q: req.near ?? undefined,
    type: req.types,
    budget_min: req.budget_min ?? undefined,
    budget_max: req.budget_max ?? undefined,
    gender: req.gender ?? undefined,
    food: req.food ? "true" : undefined,
    amenities: req.amenities,
  });
}

/** Ever-looser versions of the filters for "no exact matches", each with what was relaxed. */
function relaxations(filters: SearchFilters): { filters: SearchFilters; relaxed: string }[] {
  const steps: { filters: SearchFilters; relaxed: string }[] = [];
  let current = filters;
  if (current.q) steps.push({ filters: (current = { ...current, q: undefined }), relaxed: "the area" });
  if (current.amenities.length > 0 || current.food) {
    steps.push({ filters: (current = { ...current, amenities: [], food: false }), relaxed: "food and amenities" });
  }
  if (current.type.length > 0 || current.gender) {
    steps.push({ filters: (current = { ...current, type: [], gender: undefined }), relaxed: "the property type" });
  }
  if (current.budget_max !== undefined) {
    steps.push({
      filters: (current = { ...current, budget_max: Math.round((current.budget_max * 1.25) / 500) * 500 }),
      relaxed: "the budget (about 25% higher)",
    });
  }
  return steps;
}

async function basicReply(
  ctx: UserServiceContext,
  input: ChatInput,
  note: string | null,
): Promise<{ reply: AssistantReply; searched: { filters: SearchFilters; total: number } | null }> {
  const { cities } = await getSearchReferenceData();
  const earlier = input.history.filter((turn) => turn.role === "user").map((turn) => turn.content);
  const req = parseConversation(input.message, earlier, cities);
  const prefix = note ? `${note} ` : "";
  const base = { mode: "basic" as AssistantMode, properties: [], alternatives: false, search_query: null };

  if (!req.is_search) {
    const guidance = guidanceFor(input.message);
    return {
      searched: null,
      reply: {
        ...base,
        message:
          prefix +
          (guidance ??
            "I can find places to stay from ZUVIO listings. Tell me the city, your monthly budget and what you need, for example \"PG in Bengaluru under ₹8000 with food and Wi-Fi\"."),
        follow_up_question: guidance ? null : "Which city are you looking in, and what's your monthly budget?",
      },
    };
  }

  if (!req.city) {
    return {
      searched: null,
      reply: {
        ...base,
        message: `${prefix}Happy to help you look. I just need to know the city first.`,
        follow_up_question: `Which city are you looking in? We list places in ${cities
          .slice(0, 6)
          .map((c) => c.name)
          .join(", ")} and more.`,
      },
    };
  }

  const filters = filtersFromRequirements(req);
  const cityName = cities.find((c) => c.slug === req.city)?.name ?? req.city;
  const typeLabel =
    req.types.length === 0
      ? null
      : req.types.every((t) => t.endsWith("pg") || t === "pg")
        ? "PGs"
        : req.types.map((t) => PROPERTY_TYPE_LABELS[t]).join(" / ");
  const wanted = describeRequirements(req, cityName, typeLabel);
  const budgetQuestion = req.missing.includes("budget") ? "What's your monthly budget? I can narrow these down." : null;

  const exact = await searchPublicProperties(filters, MAX_RESULT_CARDS);
  if (exact.items.length > 0) {
    return {
      searched: { filters, total: exact.total },
      reply: {
        ...base,
        message: `${prefix}I found ${exact.total} ${exact.total === 1 ? "listing" : "listings"} for ${wanted}.`,
        properties: exact.items.map(cardFromSearch),
        follow_up_question: budgetQuestion,
        search_query: toQuery(filters),
      },
    };
  }

  for (const step of relaxations(filters)) {
    const loose = await searchPublicProperties(step.filters, MAX_RESULT_CARDS);
    if (loose.items.length === 0) continue;
    return {
      searched: { filters, total: 0 },
      reply: {
        ...base,
        message: `${prefix}No listings match ${wanted} exactly. These are close alternatives with ${step.relaxed} relaxed, so check the details.`,
        properties: loose.items.map(cardFromSearch),
        alternatives: true,
        follow_up_question: budgetQuestion,
        search_query: toQuery(step.filters),
      },
    };
  }

  return {
    searched: { filters, total: 0 },
    reply: {
      ...base,
      message: `${prefix}There are no listings for ${wanted} on ZUVIO yet, and nothing close in ${cityName} either.`,
      follow_up_question: "Would you like to try another city or a different budget?",
      search_query: toQuery(filters),
    },
  };
}

// ───────────────────────────── AI mode ─────────────────────────────

async function aiReply(
  ctx: UserServiceContext,
  provider: AIProvider,
  input: ChatInput,
): Promise<{ reply: AssistantReply; usage: Omit<repo.UsageRecord, "latency_ms" | "feature"> }> {
  const runtime = createToolRuntime(ctx);
  const result = await provider.respond({
    system: ASSISTANT_SYSTEM_PROMPT,
    history: input.history,
    message: input.message,
    tools: runtime,
  });

  const usage = {
    provider: provider.name,
    model: result.model,
    input_tokens: result.input_tokens,
    output_tokens: result.output_tokens,
    tool_calls: result.tool_calls,
    status: "success" as const,
    error_code: result.outcome === "presented" || result.outcome === "text" ? null : result.outcome,
  };
  const lastSearch = runtime.searches.at(-1);
  const searchQuery = lastSearch ? toQuery(lastSearch.filters) : null;
  if (lastSearch) await recordSearch(ctx, input.message, lastSearch.filters, lastSearch.total);

  if (result.outcome === "presented" && result.present) {
    const { cards, dropped } = selectPresentedCards(result.present.property_ids, runtime.seen);
    if (dropped.length > 0) {
      logger.warn("assistant.dropped_unverified_ids", { request_id: ctx.requestId, count: dropped.length });
    }
    return {
      usage,
      reply: {
        mode: "ai",
        message: result.present.message,
        properties: cards,
        alternatives: cards.length > 0 && result.present.alternatives,
        follow_up_question: result.present.follow_up_question?.trim() || null,
        search_query: searchQuery,
      },
    };
  }

  const message =
    result.outcome === "refusal"
      ? "I can't help with that one. I can help you find a place to stay or answer renting questions."
      : (result.text ??
        "Sorry, I couldn't finish that answer. Try asking again, a little more specifically (city, budget, type).");
  return {
    usage,
    reply: { mode: "ai", message, properties: [], alternatives: false, follow_up_question: null, search_query: null },
  };
}

// ───────────────────────────── entry point ─────────────────────────────

export async function chat(
  ctx: UserServiceContext,
  input: ChatInput,
  options: { provider?: AIProvider | null } = {},
): Promise<AssistantReply> {
  const provider = options.provider === undefined ? getAIProvider() : options.provider;
  const started = performance.now();
  const elapsed = () => performance.now() - started;
  const providerName = provider?.name ?? BASIC_PROVIDER.provider;
  const model = provider?.model ?? BASIC_PROVIDER.model;

  const allowed = await repo.consumeQuota(ctx.supabase, "assistant_daily", ASSISTANT_DAILY_LIMIT, DAY_SECONDS);
  if (!allowed) {
    await recordUsage(ctx, {
      provider: providerName,
      model,
      feature: FEATURE,
      input_tokens: 0,
      output_tokens: 0,
      tool_calls: 0,
      latency_ms: elapsed(),
      status: "rate_limited",
      error_code: "daily_quota",
    });
    throw errors.rateLimited(
      undefined,
      `You've used today's ${ASSISTANT_DAILY_LIMIT} assistant messages. You can still search listings, and the assistant is back tomorrow.`,
    );
  }

  if (provider) {
    try {
      const { reply, usage } = await aiReply(ctx, provider, input);
      await recordUsage(ctx, { ...usage, feature: FEATURE, latency_ms: elapsed() });
      return reply;
    } catch (error) {
      const code = anthropicErrorCode(error);
      logger.error("assistant.provider_failed", { request_id: ctx.requestId, code, error: serializeError(error) });
      await recordUsage(ctx, {
        provider: provider.name,
        model: provider.model,
        feature: FEATURE,
        input_tokens: 0,
        output_tokens: 0,
        tool_calls: 0,
        latency_ms: elapsed(),
        status: "error",
        error_code: code,
      });
      // Fall through to basic mode, labelled, so the user still gets real results.
      const fallbackStart = performance.now();
      const { reply, searched } = await basicReply(
        ctx,
        input,
        "The AI assistant is unavailable right now, so this is a basic search.",
      );
      if (searched) await recordSearch(ctx, input.message, searched.filters, searched.total);
      await recordUsage(ctx, {
        ...BASIC_PROVIDER,
        feature: FEATURE,
        input_tokens: 0,
        output_tokens: 0,
        tool_calls: searched ? 1 : 0,
        latency_ms: performance.now() - fallbackStart,
        status: "success",
        error_code: null,
      });
      return reply;
    }
  }

  try {
    const { reply, searched } = await basicReply(ctx, input, null);
    if (searched) await recordSearch(ctx, input.message, searched.filters, searched.total);
    await recordUsage(ctx, {
      ...BASIC_PROVIDER,
      feature: FEATURE,
      input_tokens: 0,
      output_tokens: 0,
      tool_calls: searched ? 1 : 0,
      latency_ms: elapsed(),
      status: "success",
      error_code: null,
    });
    return reply;
  } catch (error) {
    await recordUsage(ctx, {
      ...BASIC_PROVIDER,
      feature: FEATURE,
      input_tokens: 0,
      output_tokens: 0,
      tool_calls: 0,
      latency_ms: elapsed(),
      status: "error",
      error_code: "basic_search_failed",
    });
    throw error;
  }
}
