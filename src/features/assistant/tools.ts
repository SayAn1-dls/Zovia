import "server-only";

import { z } from "zod";

import { geocodeAddress, getNearbyPlaces } from "@/features/locations/service";
import { buildCostEstimate } from "@/features/properties/presenters";
import {
  FURNISHINGS,
  parseSearchFilters,
  PROPERTY_TYPES,
  type PropertyDetail,
  type SearchFilters,
  type SearchResponse,
} from "@/features/properties/schemas";
import { getPublicProperty, searchPublicProperties } from "@/features/properties/service";
import { getDeck } from "@/features/roommates/service";
import type { ServiceContext } from "@/server/auth/context";
import { isAppError } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import type { ToolDefinition, ToolOutcome, ToolRuntime } from "./provider";
import type { AssistantPropertyCard } from "./schemas";

/**
 * The assistant's database tools. Each one calls an existing service (published listings through
 * the property service, roommates through the caller's own session, so RLS applies) and returns
 * a compact JSON view for the model. Every listing a tool returns is remembered in `seen`; the
 * final answer may only show cards from that map.
 */

const SEARCH_LIMIT = 8;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const propertyId = z.string().trim().regex(UUID, "Use a property id returned by search_properties.");

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_properties",
    description:
      "Search published ZUVIO listings. Returns real listings with id, title, type, locality, city, monthly price_from in INR (the lowest bed/unit rent), bed availability, food, amenity codes and rating. Prices are monthly integer INR. Use the city name or slug (for example 'bengaluru', 'pune').",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string", description: "City name or slug." },
        q: { type: "string", description: "Free text such as a locality or landmark (optional)." },
        types: { type: "array", items: { type: "string", enum: PROPERTY_TYPES }, description: "Property types." },
        budget_min: { type: "integer", description: "Minimum monthly rent, INR." },
        budget_max: { type: "integer", description: "Maximum monthly rent, INR." },
        gender: { type: "string", enum: ["male", "female"], description: "Who it is for (includes listings for anyone)." },
        food: { type: "boolean", description: "Only listings that offer food." },
        amenities: {
          type: "array",
          items: { type: "string" },
          description:
            "Amenity codes, e.g. wifi, ac, attached_bathroom, parking, laundry, housekeeping, power_backup, gym, geyser, washing_machine, cctv, security_guard, study_table.",
        },
        furnishing: { type: "string", enum: FURNISHINGS },
        available_only: { type: "boolean", description: "Only listings with a free bed / available unit." },
        lat: { type: "number", description: "Latitude to sort by distance (from geocode_place)." },
        lng: { type: "number", description: "Longitude to sort by distance (from geocode_place)." },
        sort: { type: "string", enum: ["relevance", "price_asc", "price_desc", "newest", "distance"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_property",
    description:
      "Full details of one published listing by id: rooms and beds with rents, deposit, food and meals, utilities billing, rules, amenities, availability, trust signals and rating. Owner contact details are never included.",
    input_schema: {
      type: "object",
      properties: { property_id: { type: "string" } },
      required: ["property_id"],
      additionalProperties: false,
    },
  },
  {
    name: "compare_properties",
    description:
      "Compare 2 to 4 listings side by side: estimated monthly total, move-in total, deposit, food, availability. Use ids from search_properties.",
    input_schema: {
      type: "object",
      properties: { property_ids: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } },
      required: ["property_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "estimate_monthly_cost",
    description:
      "Itemised monthly cost and move-in cost of a listing (rent, maintenance, utilities, food, mandatory charges, deposit), computed from the owner's stated amounts. Says when an amount is unknown.",
    input_schema: {
      type: "object",
      properties: {
        property_id: { type: "string" },
        room_id: { type: "string", description: "Optional room id from get_property (per-bed listings)." },
      },
      required: ["property_id"],
      additionalProperties: false,
    },
  },
  {
    name: "find_nearby_places",
    description:
      "Named colleges, metro/railway stations, hospitals, shops and other places within 2 km of a listing (by property_id) or of a point (lat/lng). Distances are straight-line, not travel distance.",
    input_schema: {
      type: "object",
      properties: { property_id: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } },
      additionalProperties: false,
    },
  },
  {
    name: "geocode_place",
    description: "Find coordinates of an address, college, office or landmark in India.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "suggest_roommates",
    description:
      "The signed-in user's top roommate suggestions from their roommate profile, with compatibility scores. Returns a state instead when they have no active roommate profile.",
    input_schema: {
      type: "object",
      properties: { limit: { type: "integer", minimum: 1, maximum: 5 } },
      additionalProperties: false,
    },
  },
];

// ───────────────────────────── inputs ─────────────────────────────

const searchInput = z
  .object({
    city: z.string().max(80).optional(),
    q: z.string().max(100).optional(),
    types: z.array(z.string()).max(12).optional(),
    budget_min: z.number().optional(),
    budget_max: z.number().optional(),
    gender: z.string().optional(),
    food: z.boolean().optional(),
    amenities: z.array(z.string()).max(12).optional(),
    furnishing: z.string().optional(),
    available_only: z.boolean().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    sort: z.string().optional(),
  })
  .loose();
const propertyInput = z.object({ property_id: propertyId });
const compareInput = z.object({ property_ids: z.array(propertyId).min(2).max(4) });
const costInput = z.object({ property_id: propertyId, room_id: z.string().trim().regex(UUID).optional() });
const nearbyInput = z.object({ property_id: propertyId.optional(), lat: z.number().optional(), lng: z.number().optional() });
const geocodeInput = z.object({ query: z.string().trim().min(2).max(120) });
const roommateInput = z.object({ limit: z.number().int().min(1).max(5).optional() });

/** Model tool input -> the normalised search filters the /search page uses (lenient, never throws). */
export function toSearchFilters(input: z.output<typeof searchInput>): SearchFilters {
  return parseSearchFilters({
    city: input.city,
    q: input.q,
    type: input.types,
    budget_min: input.budget_min,
    budget_max: input.budget_max,
    gender: input.gender,
    food: input.food ? "true" : undefined,
    amenities: input.amenities,
    furnishing: input.furnishing,
    available_only: input.available_only ? "true" : undefined,
    lat: input.lat,
    lng: input.lng,
    sort: input.sort,
  });
}

// ───────────────────────────── views ─────────────────────────────

export function cardFromSearch(item: SearchResponse["items"][number]): AssistantPropertyCard {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    property_type: item.property_type,
    listing_mode: item.listing_mode,
    locality: item.locality,
    city: item.city,
    price_from: item.price_from,
    available_beds: item.available_beds,
    total_beds: item.total_beds,
    cover_url: item.cover_url,
    rating_avg: item.rating_avg,
    rating_count: item.rating_count,
    recently_confirmed: item.recently_confirmed,
    availability_status: item.availability_status,
    available_from: item.available_from,
  };
}

export function cardFromDetail(detail: PropertyDetail): AssistantPropertyCard {
  return {
    id: detail.id,
    slug: detail.slug,
    title: detail.title,
    property_type: detail.property_type,
    listing_mode: detail.listing_mode,
    locality: detail.locality,
    city: detail.city,
    price_from: detail.min_rent ?? detail.monthly_rent,
    available_beds: detail.available_beds,
    total_beds: detail.total_beds,
    cover_url: detail.photos[0]?.url ?? null,
    rating_avg: detail.rating_avg,
    rating_count: detail.rating_count,
    recently_confirmed: detail.trust.recently_confirmed,
    availability_status: detail.availability?.status ?? null,
    available_from: detail.availability?.available_from ?? null,
  };
}

function searchView(result: SearchResponse) {
  return {
    total_matches: result.total,
    city: result.city?.name ?? null,
    listings: result.items.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.property_type,
      listing_mode: item.listing_mode,
      for: item.tenant_gender,
      locality: item.locality,
      city: item.city,
      price_from_inr_per_month: item.price_from,
      available_beds: item.listing_mode === "per_bed" ? item.available_beds : undefined,
      total_beds: item.listing_mode === "per_bed" ? item.total_beds : undefined,
      availability: item.availability_status ?? undefined,
      available_from: item.available_from ?? undefined,
      food_available: item.food_available,
      furnishing: item.furnishing,
      amenities: item.amenity_codes,
      rating: item.rating_count > 0 ? { average: item.rating_avg, count: item.rating_count } : null,
      recently_confirmed: item.recently_confirmed,
      straight_line_distance_m: item.distance_m ?? undefined,
    })),
  };
}

function detailView(detail: PropertyDetail) {
  return {
    id: detail.id,
    title: detail.title,
    type: detail.property_type,
    listing_mode: detail.listing_mode,
    for: detail.tenant_gender,
    furnishing: detail.furnishing,
    locality: detail.locality,
    city: detail.city,
    landmark: detail.landmark,
    description: detail.description?.slice(0, 1200) ?? null,
    has_location: detail.location !== null,
    pricing_inr: {
      monthly_rent_entire_unit: detail.monthly_rent,
      min_rent: detail.min_rent,
      max_rent: detail.max_rent,
      security_deposit: detail.security_deposit,
      maintenance_monthly: detail.maintenance_monthly,
      electricity: { billing: detail.electricity_billing, monthly_estimate: detail.electricity_monthly_estimate },
      water: { billing: detail.water_billing, monthly_estimate: detail.water_monthly_estimate },
      food: {
        available: detail.food_available,
        included_in_rent: detail.food_included,
        monthly_charge: detail.food_monthly_charge,
        meals: detail.meals,
      },
      other_charges: detail.charges.map((c) => ({
        label: c.label,
        amount: c.amount,
        frequency: c.frequency,
        mandatory: c.is_mandatory,
      })),
    },
    rooms: detail.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      room_type: room.room_type,
      capacity: room.capacity,
      rent_per_bed: room.rent_per_bed,
      security_deposit: room.security_deposit,
      attached_bathroom: room.has_attached_bathroom,
      ac: room.has_ac,
      beds_available: room.beds.filter((bed) => bed.status === "available").length,
      beds_total: room.beds.length,
    })),
    available_beds: detail.available_beds,
    total_beds: detail.total_beds,
    availability: detail.availability,
    amenities: detail.amenities.map((a) => a.name),
    rules: detail.rules.map((r) => ({ rule: r.rule_code, allowed: r.allowed, value: r.value })),
    trust: {
      owner_verified: detail.trust.owner_verified,
      authorisation_verified: detail.trust.authorisation_verified,
      recently_confirmed: detail.trust.recently_confirmed,
    },
    rating: detail.rating_count > 0 ? { average: detail.rating_avg, count: detail.rating_count } : null,
    as_of: detail.as_of,
  };
}

function costView(detail: PropertyDetail, roomId?: string) {
  const view = buildCostEstimate(detail, roomId);
  if (!view.ok) return { id: detail.id, title: detail.title, estimate: null, reason: "The owner has not set a rent." };
  const { estimate } = view;
  return {
    id: detail.id,
    title: detail.title,
    monthly_total_inr: estimate.monthly_total,
    monthly_total_is_lower_bound: estimate.incomplete,
    move_in_total_inr: estimate.move_in_total,
    move_in_is_lower_bound: estimate.move_in_incomplete,
    items: estimate.items.map((item) => ({
      label: item.label,
      amount: item.amount,
      included_in_rent: item.included,
      estimated: item.estimated,
      optional: item.optional,
      counted: item.counted,
    })),
    move_in_items: estimate.move_in_items.map((item) => ({ label: item.label, amount: item.amount, counted: item.counted })),
    notes: estimate.notes,
  };
}

// ───────────────────────────── runtime ─────────────────────────────

function failure(message: string): ToolOutcome {
  return { content: { error: message }, is_error: true };
}

/**
 * Tools bound to one request. `seen` collects every listing row a tool returned (keyed by id);
 * `searches` records search calls for search_history.
 */
export function createToolRuntime(ctx: ServiceContext): ToolRuntime & {
  seen: Map<string, AssistantPropertyCard>;
  searches: { filters: SearchFilters; total: number }[];
} {
  const seen = new Map<string, AssistantPropertyCard>();
  const searches: { filters: SearchFilters; total: number }[] = [];
  const remember = (card: AssistantPropertyCard) => seen.set(card.id.toLowerCase(), card);

  async function detail(id: string): Promise<PropertyDetail> {
    const value = await getPublicProperty(id);
    remember(cardFromDetail(value));
    return value;
  }

  const handlers: Record<string, (input: unknown) => Promise<unknown>> = {
    async search_properties(raw) {
      const filters = toSearchFilters(searchInput.parse(raw ?? {}));
      const result = await searchPublicProperties(filters, SEARCH_LIMIT);
      result.items.forEach((item) => remember(cardFromSearch(item)));
      searches.push({ filters, total: result.total });
      return searchView(result);
    },
    async get_property(raw) {
      return detailView(await detail(propertyInput.parse(raw).property_id));
    },
    async compare_properties(raw) {
      const ids = [...new Set(compareInput.parse(raw).property_ids.map((id) => id.toLowerCase()))];
      const details = await Promise.all(ids.map((id) => detail(id)));
      const rows = details.map((d) => ({
        ...costView(d),
        type: d.property_type,
        locality: d.locality,
        food: { available: d.food_available, included: d.food_included },
        available_beds: d.listing_mode === "per_bed" ? d.available_beds : undefined,
        availability: d.availability?.status ?? null,
        rating: d.rating_count > 0 ? d.rating_avg : null,
        owner_verified: d.trust.owner_verified,
      }));
      return { listings: rows };
    },
    async estimate_monthly_cost(raw) {
      const input = costInput.parse(raw);
      return costView(await detail(input.property_id), input.room_id);
    },
    async find_nearby_places(raw) {
      const input = nearbyInput.parse(raw ?? {});
      let point = input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null;
      if (input.property_id) {
        const d = await detail(input.property_id);
        if (!d.location) return { error: "This listing has no map location." };
        point = d.location;
      }
      if (!point) return { error: "Give a property_id or lat and lng." };
      const nearby = await getNearbyPlaces(point);
      return {
        radius_m: nearby.radius_m,
        distances: "straight-line",
        attribution: nearby.attribution,
        places: nearby.places.slice(0, 15).map((p) => ({ kind: p.kind, name: p.name, straight_line_m: p.straight_line_m })),
      };
    },
    async geocode_place(raw) {
      const results = await geocodeAddress(geocodeInput.parse(raw).query);
      return {
        results: results.slice(0, 5).map((r) => ({ label: r.label, lat: r.lat, lng: r.lng, city: r.city, locality: r.locality })),
      };
    },
    async suggest_roommates(raw) {
      const { limit } = roommateInput.parse(raw ?? {});
      if (!ctx.user) return { error: "Roommate suggestions need a signed-in user." };
      const deck = await getDeck({ ...ctx, user: ctx.user }, limit ?? 3);
      if (deck.state !== "active") {
        return {
          state: deck.state,
          note: "The user has no active roommate profile; suggest creating or resuming it on the Roommates page.",
        };
      }
      return {
        state: "active",
        suggestions: deck.candidates.map((c) => ({
          name: c.display_name,
          age: c.age,
          occupation: c.occupation,
          city: c.city,
          preferred_localities: c.preferred_localities,
          budget_inr: { min: c.budget_min, max: c.budget_max },
          has_place: c.has_place,
          compatibility: { score: c.compatibility.score, explanation: c.compatibility.explanation },
        })),
        note: "Point the user to the Roommates page to view profiles and connect.",
      };
    },
  };

  return {
    definitions: TOOL_DEFINITIONS,
    seen,
    searches,
    async run(name, input) {
      const handler = handlers[name];
      if (!handler) return failure(`Unknown tool ${name}.`);
      try {
        return { content: await handler(input) };
      } catch (error) {
        if (error instanceof z.ZodError) return failure(`Invalid input: ${z.prettifyError(error)}`);
        if (isAppError(error)) {
          if (error.code === "not_found") return failure("No published listing has that id.");
          if (error.code === "unavailable") return failure(error.message);
        }
        logger.warn("assistant.tool_failed", { request_id: ctx.requestId, tool: name, error: serializeError(error) });
        return failure("This tool failed. Continue without it and say so if it matters.");
      }
    },
  };
}
