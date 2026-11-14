import "server-only";

import {
  PROPERTY_TYPE_LABELS,
  parseSearchFilters,
  searchFiltersToQuery,
  type SearchFilters,
} from "@/features/properties/schemas";
import {
  getSearchReferenceData,
  searchPublicProperties,
} from "@/features/properties/service";
import type { UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";
import type { Json } from "@/lib/database.types";

import {
  DIET_LABELS,
  SHARING_LABELS,
  SMOKING_LABELS,
  type CatalogListing,
  type CatalogSearch,
} from "@/features/catalog/listings";
import { nearbyForListing } from "@/features/catalog/nearby";
import { formatDistance, formatINR } from "@/lib/format";

import { AnthropicProvider, anthropicErrorCode } from "./anthropic-provider";
import { describeRequirements, guidanceFor } from "./basic";
import {
  CATALOG_CITY_REFS,
  CATALOG_LOCALITY_REFS,
  catalogCard,
  catalogListingsNamed,
  catalogRentStats,
  searchCatalogSorted,
} from "./catalog";
import { parseConversation, type ParsedRequirements } from "./parser";
import { selectPresentedCards } from "./present";
import type { AIProvider } from "./provider";
import * as repo from "./repository";
import {
  MAX_RESULT_CARDS,
  type AssistantMode,
  type AssistantPropertyCard,
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
  return new AnthropicProvider({
    apiKey: config.AI_PROVIDER_API_KEY,
    model: config.AI_MODEL,
  });
}

export function getAssistantStatus(): AssistantStatus {
  return { mode: getAIProvider() ? "ai" : "basic" };
}

async function recordUsage(
  ctx: UserServiceContext,
  record: repo.UsageRecord,
): Promise<void> {
  try {
    await repo.logUsage(ctx.supabase, record);
  } catch (error) {
    logger.warn("assistant.usage_log_failed", {
      request_id: ctx.requestId,
      error: serializeError(error),
    });
  }
}

async function recordSearch(
  ctx: UserServiceContext,
  query: string,
  filters: SearchFilters,
  total: number,
) {
  try {
    const params = Object.fromEntries(
      Object.entries(searchFiltersToQuery(filters)).filter(
        ([, value]) => value !== undefined,
      ),
    ) as { [key: string]: Json | undefined };
    await repo.insertSearchHistory(ctx.supabase, {
      user_id: ctx.user.id,
      query_text: query.slice(0, 500),
      filters: params,
      result_count: total,
    });
  } catch (error) {
    logger.warn("assistant.search_history_failed", {
      request_id: ctx.requestId,
      error: serializeError(error),
    });
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

export function filtersFromRequirements(
  req: ParsedRequirements,
): SearchFilters {
  return parseSearchFilters({
    city: req.city ?? undefined,
    q: req.near ?? req.locality ?? undefined,
    type: req.types,
    budget_min: req.budget_min ?? undefined,
    budget_max: req.budget_max ?? undefined,
    gender: req.gender ?? undefined,
    food: req.food || req.diet !== null ? "true" : undefined,
    amenities: req.amenities,
    available_only: req.available_only ? "true" : undefined,
    sort: req.sort ?? undefined,
  });
}

function catalogFilters(req: ParsedRequirements): CatalogSearch {
  return {
    city: req.city ?? undefined,
    locality: req.locality ?? undefined,
    q: req.locality ? undefined : (req.near ?? undefined),
    types: propertyTypesOf(req),
    gender: req.gender ?? undefined,
    budget_min: req.budget_min ?? undefined,
    budget_max: req.budget_max ?? undefined,
    food: req.food,
    diet: req.diet ?? undefined,
    smoking: req.smoking ?? undefined,
    sharing: req.sharing ?? undefined,
    amenities: req.amenities,
    available_only: req.available_only,
  };
}

/** Ever-looser versions of what was asked for "no exact matches", each with what was relaxed. */
function relaxations(
  req: ParsedRequirements,
): { req: ParsedRequirements; relaxed: string }[] {
  const steps: { req: ParsedRequirements; relaxed: string }[] = [];
  let current = req;
  if (current.near || current.locality) {
    steps.push({
      req: (current = { ...current, near: null, locality: null }),
      relaxed: "the exact area",
    });
  }
  if (
    current.amenities.length > 0 ||
    current.sharing ||
    current.available_only
  ) {
    steps.push({
      req: (current = {
        ...current,
        amenities: [],
        sharing: null,
        available_only: false,
      }),
      relaxed: "room type and amenities",
    });
  }
  if (current.smoking)
    steps.push({
      req: (current = { ...current, smoking: null }),
      relaxed: "the smoking rule",
    });
  if (current.food || current.diet)
    steps.push({
      req: (current = { ...current, food: false, diet: null }),
      relaxed: "food",
    });
  if (current.types.length > 0 || current.gender) {
    steps.push({
      req: (current = { ...current, types: [], gender: null }),
      relaxed: "the property type",
    });
  }
  if (current.budget_max !== null) {
    steps.push({
      req: (current = {
        ...current,
        budget_max: Math.round((current.budget_max * 1.25) / 500) * 500,
      }),
      relaxed: "the budget (about 25% higher)",
    });
  }
  return steps;
}

/** Listings for these requirements: owners' own listings first (when they can be checked), then the catalogue. */
/** Lowest rent for the room type asked for (any room type when none was named). */
function rentFor(
  listing: CatalogListing,
  sharing: ParsedRequirements["sharing"],
): number {
  const rents = listing.sharing
    .filter((option) => !sharing || option.type === sharing)
    .map((option) => option.rent);
  return rents.length > 0 ? Math.min(...rents) : listing.price_from;
}

/** Room-type words ("single room", "sharing") are about the room, not the kind of property. */
function propertyTypesOf(req: ParsedRequirements): ParsedRequirements["types"] {
  return req.sharing
    ? req.types.filter(
        (type) => type !== "private_room" && type !== "shared_room",
      )
    : req.types;
}

async function findListings(req: ParsedRequirements): Promise<{
  cards: AssistantPropertyCard[];
  total: number;
  cheapest: { listing: CatalogListing; rent: number } | null;
}> {
  // Diet, smoking and sharing are catalogue-only details, so owner listings join only when none is asked for.
  const dbUsable =
    req.diet === null &&
    req.smoking === null &&
    req.sharing === null &&
    req.locality === null;
  let db: Awaited<ReturnType<typeof searchPublicProperties>> | null = null;
  if (dbUsable) {
    try {
      db = await searchPublicProperties(
        filtersFromRequirements(req),
        MAX_RESULT_CARDS,
      );
    } catch (error) {
      logger.warn("assistant.db_search_failed", {
        error: serializeError(error),
      });
    }
  }
  const catalog = searchCatalogSorted(catalogFilters(req), req.sort);
  const cards = [
    ...(db?.items.map(cardFromSearch) ?? []),
    ...catalog.map(catalogCard),
  ].slice(0, MAX_RESULT_CARDS);
  const cheapest = catalog.reduce<{
    listing: CatalogListing;
    rent: number;
  } | null>((best, listing) => {
    const rent = rentFor(listing, req.sharing);
    return best && best.rent <= rent ? best : { listing, rent };
  }, null);
  return { cards, total: (db?.total ?? 0) + catalog.length, cheapest };
}

function typeLabelOf(req: ParsedRequirements): string | null {
  const types = propertyTypesOf(req);
  if (types.length === 0) return null;
  if (types.every((t) => t.endsWith("pg") || t === "pg"))
    return req.gender === "female"
      ? "girls' PGs"
      : req.gender === "male"
        ? "boys' PGs"
        : "PGs";
  return types.map((t) => PROPERTY_TYPE_LABELS[t]).join(" / ");
}

function cityNameOf(
  slug: string | null,
  cities: readonly { slug: string; name: string }[],
): string | null {
  return slug ? (cities.find((c) => c.slug === slug)?.name ?? slug) : null;
}

const STATS_QUESTION =
  /\b(average|avg|typical|usual|normal|how much|what(?:'s| is) the rent|rent range|price range|cost of (?:living|rent)|expensive|cheap areas?|cheapest area)\b/;

function describeListing(listing: CatalogListing): string {
  const rooms = listing.sharing
    .map(
      (option) =>
        `${SHARING_LABELS[option.type].toLowerCase()} ${formatINR(option.rent)}`,
    )
    .join(", ");
  const food = listing.food.provided
    ? `${DIET_LABELS[listing.food.diet!].toLowerCase()} meals included`
    : "no meals (self-cooking)";
  const station = nearbyForListing(listing).find(
    (place) =>
      place.kind === "metro_station" || place.kind === "railway_station",
  );
  return [
    `${listing.title} is a ${listing.kind === "pg" ? "PG" : listing.kind === "hostel" ? "hostel" : "co-living space"} in ${listing.locality}, ${listing.city} for ${listing.best_for.toLowerCase()}.`,
    `Rent: ${rooms} a month; ${listing.available_beds} of ${listing.total_beds} beds are free.`,
    `Food: ${food}. ${SMOKING_LABELS[listing.rules.smoking]}${listing.rules.gate_closes ? `, gate closes ${listing.rules.gate_closes}` : ", no curfew"}.`,
    station
      ? `Nearest station: ${station.name}, about ${formatDistance(station.metres)} away.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

async function basicReply(
  ctx: UserServiceContext,
  input: ChatInput,
  note: string | null,
): Promise<{
  reply: AssistantReply;
  searched: { filters: SearchFilters; total: number } | null;
}> {
  let dbCities: { slug: string; name: string }[] = [];
  try {
    dbCities = (await getSearchReferenceData()).cities;
  } catch {
    dbCities = [];
  }
  const cities = [
    ...CATALOG_CITY_REFS,
    ...dbCities.filter(
      (c) => !CATALOG_CITY_REFS.some((known) => known.slug === c.slug),
    ),
  ];
  const earlier = input.history
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content);
  const req = parseConversation(
    input.message,
    earlier,
    cities,
    CATALOG_LOCALITY_REFS,
  );
  const prefix = note ? `${note} ` : "";
  const base = {
    mode: "basic" as AssistantMode,
    properties: [],
    alternatives: false,
    search_query: null,
  };
  const lower = input.message.toLowerCase();

  // "Tell me about Shanti Co-living": answer about that PG.
  const allNamed = catalogListingsNamed(input.message);
  // When the area or city was mentioned too, keep only those; otherwise show every PG of that name.
  const located = allNamed.filter(
    (l) =>
      input.message.toLowerCase().includes(l.locality.toLowerCase()) ||
      l.city_slug === req.city,
  );
  const named = located.length > 0 ? located : allNamed;
  if (named.length > 0) {
    const listing = named[0]!;
    return {
      searched: null,
      reply: {
        ...base,
        message: `${prefix}${describeListing(listing)}`,
        properties: named.slice(0, 3).map(catalogCard),
        follow_up_question:
          named.length > 1
            ? `There is more than one ${listing.title}; which area do you mean?`
            : "Want me to find similar places nearby?",
      },
    };
  }

  const guidance = guidanceFor(input.message);
  if (!req.is_search || (guidance && !req.city && req.budget_max === null)) {
    return {
      searched: null,
      reply: {
        ...base,
        message:
          prefix +
          (guidance ??
            'I can find PGs, hostels and co-living in 25 Indian cities. Tell me the city, your budget and what matters, for example "veg PG in Pune under ₹10k, no smoking".'),
        follow_up_question: guidance
          ? null
          : "Which city are you looking in, and what's your monthly budget?",
      },
    };
  }

  if (!req.city) {
    return {
      searched: null,
      reply: {
        ...base,
        message: `${prefix}Happy to help you look. Which city should I search?`,
        follow_up_question: `I cover ${CATALOG_CITY_REFS.slice(0, 8)
          .map((c) => c.name)
          .join(", ")} and ${CATALOG_CITY_REFS.length - 8} more cities.`,
      },
    };
  }

  const cityName = cityNameOf(req.city, cities)!;
  const filters = filtersFromRequirements(req);

  // "Average rent in Pune?": the rent picture, with the cheapest places.
  if (STATS_QUESTION.test(lower)) {
    const stats = catalogRentStats(req.city, req.locality);
    if (stats) {
      const where = stats.locality
        ? `${stats.locality}, ${stats.city}`
        : stats.city;
      const cheapest = searchCatalogSorted(
        { city: req.city, locality: req.locality ?? undefined },
        "price_asc",
      ).slice(0, 3);
      return {
        searched: { filters, total: stats.count },
        reply: {
          ...base,
          message: `${prefix}In ${where}, PG and hostel rent on Zovia runs ${formatINR(stats.min)} to ${formatINR(stats.max)} a month (typical ${formatINR(stats.median)}) across ${stats.count} places. ${
            stats.locality
              ? ""
              : `The most affordable areas are ${stats.cheapest_areas.map((a) => `${a.name} (from ${formatINR(a.from)})`).join(", ")}. `
          }${stats.veg_count} serve pure-veg food and ${stats.smoke_free_count} are smoke-free. Single rooms cost more; triple sharing is the cheapest.`,
          properties: cheapest.map(catalogCard),
          follow_up_question:
            req.budget_max === null
              ? "What's your monthly budget? I'll narrow it down."
              : null,
          search_query: toQuery(filters),
        },
      };
    }
  }

  const wanted = describeRequirements(req, cityName, typeLabelOf(req));
  const budgetQuestion = req.missing.includes("budget")
    ? "What's your monthly budget? I can narrow these down."
    : null;

  const exact = await findListings(req);
  if (exact.cards.length > 0) {
    const from = exact.cheapest
      ? ` ${req.sharing === "single" ? "Single rooms start" : req.sharing ? `${req.sharing[0]!.toUpperCase()}${req.sharing.slice(1)} sharing starts` : "Prices start"} at ${formatINR(exact.cheapest.rent)} a month (${exact.cheapest.listing.title}, ${exact.cheapest.listing.locality}).`
      : "";
    return {
      searched: { filters, total: exact.total },
      reply: {
        ...base,
        message: `${prefix}I found ${exact.total} ${exact.total === 1 ? "match" : "matches"} for ${wanted}.${from}${
          exact.total > exact.cards.length
            ? ` Here are the top ${exact.cards.length}.`
            : ""
        }`,
        properties: exact.cards,
        follow_up_question: budgetQuestion,
        search_query: toQuery(filters),
      },
    };
  }

  for (const step of relaxations(req)) {
    const loose = await findListings(step.req);
    if (loose.cards.length === 0) continue;
    return {
      searched: { filters, total: 0 },
      reply: {
        ...base,
        message: `${prefix}No exact match for ${wanted}. Here are the closest, with ${step.relaxed} relaxed, so check the details.`,
        properties: loose.cards,
        alternatives: true,
        follow_up_question: budgetQuestion,
        search_query: toQuery(filtersFromRequirements(step.req)),
      },
    };
  }

  return {
    searched: { filters, total: 0 },
    reply: {
      ...base,
      message: `${prefix}There are no listings for ${wanted} on Zovia yet, and nothing close in ${cityName} either.`,
      follow_up_question:
        "Would you like to try another city or a different budget?",
      search_query: toQuery(filters),
    },
  };
}

// ───────────────────────────── AI mode ─────────────────────────────

async function aiReply(
  ctx: UserServiceContext,
  provider: AIProvider,
  input: ChatInput,
): Promise<{
  reply: AssistantReply;
  usage: Omit<repo.UsageRecord, "latency_ms" | "feature">;
}> {
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
    error_code:
      result.outcome === "presented" || result.outcome === "text"
        ? null
        : result.outcome,
  };
  const lastSearch = runtime.searches.at(-1);
  const searchQuery = lastSearch ? toQuery(lastSearch.filters) : null;
  if (lastSearch)
    await recordSearch(
      ctx,
      input.message,
      lastSearch.filters,
      lastSearch.total,
    );

  if (result.outcome === "presented" && result.present) {
    const { cards, dropped } = selectPresentedCards(
      result.present.property_ids,
      runtime.seen,
    );
    if (dropped.length > 0) {
      logger.warn("assistant.dropped_unverified_ids", {
        request_id: ctx.requestId,
        count: dropped.length,
      });
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
    reply: {
      mode: "ai",
      message,
      properties: [],
      alternatives: false,
      follow_up_question: null,
      search_query: null,
    },
  };
}

// ───────────────────────────── entry point ─────────────────────────────

export async function chat(
  ctx: UserServiceContext,
  input: ChatInput,
  options: { provider?: AIProvider | null } = {},
): Promise<AssistantReply> {
  const provider =
    options.provider === undefined ? getAIProvider() : options.provider;
  const started = performance.now();
  const elapsed = () => performance.now() - started;
  const providerName = provider?.name ?? BASIC_PROVIDER.provider;
  const model = provider?.model ?? BASIC_PROVIDER.model;

  const allowed = await repo.consumeQuota(
    ctx.supabase,
    "assistant_daily",
    ASSISTANT_DAILY_LIMIT,
    DAY_SECONDS,
  );
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
      await recordUsage(ctx, {
        ...usage,
        feature: FEATURE,
        latency_ms: elapsed(),
      });
      return reply;
    } catch (error) {
      const code = anthropicErrorCode(error);
      logger.error("assistant.provider_failed", {
        request_id: ctx.requestId,
        code,
        error: serializeError(error),
      });
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
      if (searched)
        await recordSearch(
          ctx,
          input.message,
          searched.filters,
          searched.total,
        );
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
    if (searched)
      await recordSearch(ctx, input.message, searched.filters, searched.total);
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
