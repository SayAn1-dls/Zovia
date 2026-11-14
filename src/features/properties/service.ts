import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { parsePoint } from "@/features/locations/geo";
import { publicServiceContext, type UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { AppError, errors } from "@/server/http/errors";
import { pageMeta, toRange, type Pagination } from "@/server/http/pagination";

import { isAuthorisationVerified, isRecentlyConfirmed, propertyMediaUrl } from "./presenters";
import { cacheScopedPublicContext } from "./cache-client.repository";
import * as repo from "./repository";
import {
  PROPERTY_CACHE_TAGS,
  SEARCH_PAGE_SIZE,
  type AmenityOption,
  type CityOption,
  type InquiryInput,
  type MyInquiry,
  type OwnerContact,
  type PropertyDetail,
  type PropertyReview,
  type PropertyRoom,
  type SavedPropertyItem,
  type SearchFilters,
  type SearchResponse,
  type SearchResultItem,
} from "./schemas";

/**
 * Property marketplace services.
 *
 * Public reads (search, detail, reference data) use the cookieless anon client and are cached
 * with "use cache" so public pages never read cookies: search and detail for minutes (bed
 * statuses and prices change), reference data for days. Tags in PROPERTY_CACHE_TAGS let owner /
 * admin flows revalidate on change. Seeker actions (save, enquire, reveal) run as the caller
 * through a UserServiceContext; Postgres (RLS + SECURITY DEFINER functions) enforces the rules.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mediaUrl(path: string | null | undefined): string | null {
  return propertyMediaUrl(env().NEXT_PUBLIC_SUPABASE_URL, path);
}

function numberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ───────────────────────────── reference data ─────────────────────────────

/** Active cities (with centres) and the amenity catalogue, for filters and map centring; empty when the database is unreachable. */
export async function getSearchReferenceData(): Promise<{ cities: CityOption[]; amenities: AmenityOption[] }> {
  "use cache";
  cacheLife("days");
  cacheTag(PROPERTY_CACHE_TAGS.reference);
  const { supabase } = cacheScopedPublicContext();
  let cities: Awaited<ReturnType<typeof repo.listCities>>;
  let amenities: AmenityOption[];
  try {
    [cities, amenities] = await Promise.all([repo.listCities(supabase), repo.listAmenities(supabase)]);
  } catch {
    // Database unreachable (also at build time): callers fall back to the city catalogue. Cache
    // the empty answer only briefly so the real lists come back as soon as the database does.
    cacheLife("seconds");
    return { cities: [], amenities: [] };
  }
  return {
    cities: cities.flatMap((city) => {
      const point = parsePoint(city.location);
      return point ? [{ slug: city.slug, name: city.name, state: city.state, lat: point.lat, lng: point.lng }] : [];
    }),
    amenities,
  };
}

/** The reference city a `city` filter (slug or name) refers to, if any. */
export function resolveCity(cities: readonly CityOption[], value: string | undefined): CityOption | null {
  if (!value) return null;
  const needle = value.trim().toLowerCase();
  return cities.find((city) => city.slug === needle || city.name.toLowerCase() === needle) ?? null;
}

// ───────────────────────────── search ─────────────────────────────

/**
 * One page of published listings for normalised filters (from `parseSearchFilters`). Distance
 * sorting measures from "near me" (lat/lng) or, failing that, from the chosen city's centre;
 * distances are straight-line.
 */
export async function searchPublicProperties(
  filters: SearchFilters,
  limit: number = SEARCH_PAGE_SIZE,
): Promise<SearchResponse> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PROPERTY_CACHE_TAGS.all);

  const { supabase } = cacheScopedPublicContext();
  const { cities } = await getSearchReferenceData();
  const city = resolveCity(cities, filters.city);
  const origin =
    filters.lat !== undefined && filters.lng !== undefined
      ? { lat: filters.lat, lng: filters.lng }
      : filters.sort === "distance" && city
        ? { lat: city.lat, lng: city.lng }
        : null;
  const sort = filters.sort === "distance" && !origin ? "relevance" : filters.sort;
  const offset = (filters.page - 1) * limit;

  const rows = await repo.searchProperties(supabase, {
    city: city?.slug ?? filters.city ?? null,
    q: filters.q ?? null,
    types: filters.type.length > 0 ? filters.type : null,
    budget_min: filters.budget_min ?? null,
    budget_max: filters.budget_max ?? null,
    gender: filters.gender ?? null,
    food: filters.food ? true : null,
    amenities: filters.amenities.length > 0 ? filters.amenities : null,
    furnishing: filters.furnishing ?? null,
    available_only: filters.available_only,
    lat: origin?.lat ?? null,
    lng: origin?.lng ?? null,
    sort,
    limit,
    offset,
  });

  const entireUnitIds = rows.filter((row) => row.listing_mode === "entire_unit").map((row) => row.id);
  const availability = new Map(
    (await repo.fetchAvailability(supabase, entireUnitIds)).map((row) => [row.property_id, row]),
  );
  // Inside "use cache": the clock is read once per cache entry (freshness has minute precision).
  const now = Date.now();

  const items: SearchResultItem[] = rows.map((row) => {
    const avail = availability.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      property_type: row.property_type,
      listing_mode: row.listing_mode,
      tenant_gender: row.tenant_gender,
      furnishing: row.furnishing ?? null,
      locality: row.locality ?? null,
      city: row.city ?? null,
      price_from: numberOrNull(row.price_from),
      available_beds: row.available_beds ?? 0,
      total_beds: row.total_beds ?? 0,
      amenity_codes: row.amenity_codes ?? [],
      food_available: row.food_available,
      cover_url: mediaUrl(row.cover_media_path),
      rating_avg: numberOrNull(row.rating_avg),
      rating_count: row.rating_count ?? 0,
      recently_confirmed: isRecentlyConfirmed(row.last_confirmed_at, now),
      lat: numberOrNull(row.lat),
      lng: numberOrNull(row.lng),
      distance_m: numberOrNull(row.distance_m),
      availability_status: avail?.status ?? null,
      available_from: avail?.available_from ?? null,
    };
  });

  return {
    items,
    total: Number(rows[0]?.total_count ?? 0),
    page: filters.page,
    limit,
    city,
    origin,
  };
}

// ───────────────────────────── detail ─────────────────────────────

/** A published listing by slug, with everything the detail page shows; null when not public. */
export async function getPublicPropertyBySlug(slug: string): Promise<PropertyDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag(PROPERTY_CACHE_TAGS.all, PROPERTY_CACHE_TAGS.detail(slug));

  if (slug.length > 120 || !SLUG.test(slug)) return null;
  const { supabase } = cacheScopedPublicContext();
  const row = await repo.fetchPublishedPropertyBySlug(supabase, slug);
  if (!row) return null;
  const children = await repo.fetchPropertyChildren(supabase, row.id, row.owner_id);
  const authors = new Map(
    (await repo.fetchUserCards(supabase, [...new Set(children.reviews.map((r) => r.author_id))])).map((card) => [
      card.user_id,
      card.display_name,
    ]),
  );
  const now = Date.now();

  const bedsByRoom = new Map<string, PropertyRoom["beds"]>();
  for (const bed of children.beds) {
    const list = bedsByRoom.get(bed.room_id) ?? [];
    list.push({
      id: bed.id,
      label: bed.label,
      status: bed.status,
      available_from: bed.available_from,
      rent_override: bed.rent_override,
    });
    bedsByRoom.set(bed.room_id, list);
  }

  const reviews: PropertyReview[] = children.reviews.map((review) => {
    const reply = Array.isArray(review.owner_replies) ? review.owner_replies[0] : review.owner_replies;
    return {
      id: review.id,
      rating: review.rating,
      title: review.title,
      body: review.body,
      created_at: review.created_at,
      author_name: authors.get(review.author_id) ?? "Zovia member",
      owner_reply: reply ? { body: reply.body, created_at: reply.created_at } : null,
    };
  });

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    property_type: row.property_type,
    listing_mode: row.listing_mode,
    tenant_gender: row.tenant_gender,
    furnishing: row.furnishing,
    address_line: row.address_line,
    locality: row.locality,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    landmark: row.landmark,
    location: parsePoint(row.location),
    monthly_rent: row.monthly_rent,
    security_deposit: row.security_deposit,
    maintenance_monthly: row.maintenance_monthly,
    electricity_billing: row.electricity_billing,
    electricity_monthly_estimate: row.electricity_monthly_estimate,
    water_billing: row.water_billing,
    water_monthly_estimate: row.water_monthly_estimate,
    food_available: row.food_available,
    food_included: row.food_included,
    food_monthly_charge: row.food_monthly_charge,
    meals: { breakfast: row.meals_breakfast, lunch: row.meals_lunch, dinner: row.meals_dinner },
    min_rent: row.min_rent,
    max_rent: row.max_rent,
    total_beds: row.total_beds,
    available_beds: row.available_beds,
    rating_avg: numberOrNull(row.rating_avg),
    rating_count: row.rating_count,
    published_at: row.published_at,
    photos: children.media.flatMap((media, index) => {
      const url = mediaUrl(media.storage_path);
      return url
        ? [
            {
              id: media.id,
              url,
              alt: media.alt_text?.trim() || `${row.title}, photo ${index + 1}`,
              width: media.width,
              height: media.height,
              room_id: media.room_id,
            },
          ]
        : [];
    }),
    rooms: children.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      room_type: room.room_type,
      capacity: room.capacity,
      rent_per_bed: room.rent_per_bed,
      security_deposit: room.security_deposit,
      has_attached_bathroom: room.has_attached_bathroom,
      has_ac: room.has_ac,
      has_balcony: room.has_balcony,
      floor: room.floor,
      area_sqft: room.area_sqft,
      description: room.description,
      beds: bedsByRoom.get(room.id) ?? [],
    })),
    amenities: children.amenities
      .flatMap((entry) => {
        const amenity = Array.isArray(entry.amenities) ? entry.amenities[0] : entry.amenities;
        return amenity ? [amenity] : [];
      })
      .sort((a, b) => a.position - b.position)
      .map(({ code, name, category, icon }) => ({ code, name, category, icon })),
    rules: children.rules,
    charges: children.charges.map(({ id, label, amount, frequency, is_mandatory }) => ({
      id,
      label,
      amount,
      frequency,
      is_mandatory,
    })),
    availability: children.availability,
    owner: children.owner
      ? {
          user_id: children.owner.user_id ?? row.owner_id,
          display_name: children.owner.display_name ?? "Owner",
          owner_type: children.owner.owner_type ?? "individual",
          verification_status: children.owner.verification_status ?? "unverified",
          verified_at: children.owner.verified_at,
          member_since: children.owner.member_since ?? row.published_at ?? "",
        }
      : null,
    trust: {
      owner_verified: children.owner?.verification_status === "verified",
      authorisation_verified: isAuthorisationVerified(children.authorisation, now),
      recently_confirmed: isRecentlyConfirmed(row.last_confirmed_at, now),
      last_confirmed_at: row.last_confirmed_at,
    },
    reviews,
    as_of: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now),
  };
}

/** Detail by id or slug (for the API). */
export async function getPublicProperty(ref: string): Promise<PropertyDetail> {
  let slug = ref.trim().toLowerCase();
  if (UUID.test(slug)) {
    const row = await repo.fetchPublishedPropertyById(publicServiceContext().supabase, slug);
    if (!row) throw errors.notFound("Listing not found.");
    slug = row.slug;
  }
  const detail = await getPublicPropertyBySlug(slug);
  if (!detail) throw errors.notFound("Listing not found.");
  return detail;
}

// ───────────────────────────── seeker actions ─────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  if (!(error instanceof AppError) || error.code !== "conflict") return false;
  const cause = error.cause as { code?: unknown } | undefined;
  return cause?.code === "23505";
}

const MAX_SAVED_IDS = 1000;

export async function listSavedPropertyIds(ctx: UserServiceContext): Promise<string[]> {
  return repo.listSavedPropertyIds(ctx.supabase, ctx.user.id, MAX_SAVED_IDS);
}

export async function listSavedProperties(
  ctx: UserServiceContext,
  pagination: Pagination,
): Promise<{ items: SavedPropertyItem[]; meta: ReturnType<typeof pageMeta> }> {
  const { from, to } = toRange(pagination);
  const { rows, total } = await repo.listSavedProperties(ctx.supabase, ctx.user.id, { from, to });
  const items: SavedPropertyItem[] = rows.map((row) => {
    const p = Array.isArray(row.property) ? row.property[0] : row.property;
    const visible = p && p.status === "published" && p.deleted_at === null;
    return {
      property_id: row.property_id,
      saved_at: row.created_at,
      property: visible
        ? {
            id: p.id,
            slug: p.slug,
            title: p.title,
            property_type: p.property_type,
            listing_mode: p.listing_mode,
            locality: p.locality,
            city: p.city,
            price_from: p.min_rent ?? p.monthly_rent,
            available_beds: p.available_beds,
            total_beds: p.total_beds,
            cover_url: mediaUrl(p.cover_media_path),
            rating_avg: numberOrNull(p.rating_avg),
            rating_count: p.rating_count,
          }
        : null,
    };
  });
  return { items, meta: pageMeta(pagination, total) };
}

/** Saves a published listing (idempotent). RLS refuses anything not published. */
export async function saveProperty(ctx: UserServiceContext, propertyId: string): Promise<{ property_id: string }> {
  try {
    await repo.insertSavedProperty(ctx.supabase, ctx.user.id, propertyId);
  } catch (error) {
    if (error instanceof AppError && (error.code === "forbidden" || error.code === "conflict")) {
      throw errors.notFound("This listing is not available to save.", { cause: error });
    }
    throw error;
  }
  return { property_id: propertyId };
}

export async function unsaveProperty(ctx: UserServiceContext, propertyId: string): Promise<{ property_id: string }> {
  await repo.deleteSavedProperty(ctx.supabase, ctx.user.id, propertyId);
  return { property_id: propertyId };
}

/** Sends an enquiry through `create_property_inquiry` (which re-checks everything in SQL). */
export async function sendInquiry(
  ctx: UserServiceContext,
  propertyId: string,
  input: InquiryInput,
): Promise<{ id: string }> {
  try {
    return { id: await repo.createInquiry(ctx.supabase, propertyId, input) };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw errors.conflict(
        "You already have an open enquiry for this listing. The owner will get back to you.",
        { cause: error },
      );
    }
    throw error;
  }
}

/** Owner's phone / WhatsApp through `reveal_owner_contact` (signed-in, rate limited, recorded in SQL). */
export async function revealOwnerContact(ctx: UserServiceContext, propertyId: string): Promise<OwnerContact> {
  const row = await repo.revealOwnerContact(ctx.supabase, propertyId);
  if (!row) throw errors.notFound("The owner's contact details are not available.");
  return {
    display_name: row.display_name ?? "Owner",
    contact_phone: row.contact_phone ?? null,
    whatsapp_number: row.whatsapp_number ?? null,
  };
}

export async function listMyInquiries(
  ctx: UserServiceContext,
  pagination: Pagination,
): Promise<{ items: MyInquiry[]; meta: ReturnType<typeof pageMeta> }> {
  const { from, to } = toRange(pagination);
  const { rows, total } = await repo.listOwnInquiries(ctx.supabase, ctx.user.id, { from, to });
  return {
    items: rows.map((row) => {
      const p = Array.isArray(row.property) ? row.property[0] : row.property;
      return {
        id: row.id,
        status: row.status,
        message: row.message,
        move_in_date: row.move_in_date,
        occupants: row.occupants,
        created_at: row.created_at,
        owner_responded_at: row.owner_responded_at,
        property: p ? { id: p.id, slug: p.slug, title: p.title, locality: p.locality, city: p.city } : null,
      };
    }),
    meta: pageMeta(pagination, total),
  };
}
