import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

import type { InquiryInput, SearchSort } from "./schemas";

/**
 * Property data. The only place that queries the marketplace tables for this module. Every read
 * runs under the caller's RLS: with the cookieless anon client only published, non-deleted
 * listings (and their children) are visible; the explicit `status = 'published'` filters below
 * repeat that so a signed-in owner never sees their own drafts through public pages.
 * Columns are always listed explicitly.
 */

type Enums = Database["public"]["Enums"];

export type SearchRpcArgs = {
  city: string | null;
  q: string | null;
  types: Enums["property_type"][] | null;
  budget_min: number | null;
  budget_max: number | null;
  gender: Enums["tenant_gender"] | null;
  food: boolean | null;
  amenities: string[] | null;
  furnishing: Enums["furnishing"] | null;
  available_only: boolean;
  lat: number | null;
  lng: number | null;
  sort: SearchSort;
  limit: number;
  offset: number;
};

export async function searchProperties(supabase: AppSupabaseClient, args: SearchRpcArgs) {
  const { data, error } = await supabase.rpc("search_properties", {
    p_city: args.city ?? undefined,
    p_q: args.q ?? undefined,
    p_types: args.types ?? undefined,
    p_budget_min: args.budget_min ?? undefined,
    p_budget_max: args.budget_max ?? undefined,
    p_gender: args.gender ?? undefined,
    p_food: args.food ?? undefined,
    p_amenities: args.amenities ?? undefined,
    p_furnishing: args.furnishing ?? undefined,
    p_available_only: args.available_only,
    p_lat: args.lat ?? undefined,
    p_lng: args.lng ?? undefined,
    p_sort: args.sort,
    p_limit: args.limit,
    p_offset: args.offset,
  });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function fetchAvailability(supabase: AppSupabaseClient, propertyIds: string[]) {
  if (propertyIds.length === 0) return [];
  const { data, error } = await supabase
    .from("property_availability")
    .select("property_id, status, available_from, min_stay_months, notice_period_days")
    .in("property_id", propertyIds);
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function listCities(supabase: AppSupabaseClient) {
  const { data, error } = await supabase
    .from("cities")
    .select("slug, name, state, location")
    .eq("is_active", true)
    .order("position");
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function listAmenities(supabase: AppSupabaseClient) {
  const { data, error } = await supabase.from("amenities").select("code, name, category, icon").order("position");
  if (error) throw fromSupabaseError(error);
  return data;
}

const PROPERTY_DETAIL_COLUMNS = `id, owner_id, slug, title, description, property_type, listing_mode, tenant_gender, furnishing,
  address_line, locality, city, state, pincode, landmark, location,
  monthly_rent, security_deposit, maintenance_monthly, electricity_billing, electricity_monthly_estimate,
  water_billing, water_monthly_estimate, food_available, food_included, food_monthly_charge,
  meals_breakfast, meals_lunch, meals_dinner, min_rent, max_rent, total_beds, available_beds,
  rating_avg, rating_count, published_at, last_confirmed_at`;

export async function fetchPublishedPropertyBySlug(supabase: AppSupabaseClient, slug: string) {
  const { data, error } = await supabase
    .from("properties")
    .select(PROPERTY_DETAIL_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function fetchPublishedPropertyById(supabase: AppSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, slug")
    .eq("id", id)
    .eq("status", "published")
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

/** Everything that hangs off one listing, read in parallel. */
export async function fetchPropertyChildren(supabase: AppSupabaseClient, propertyId: string, ownerId: string) {
  const [rooms, beds, media, amenities, rules, charges, availability, authorisation, owner, reviews] =
    await Promise.all([
      supabase
        .from("rooms")
        .select(
          "id, name, room_type, capacity, rent_per_bed, security_deposit, has_attached_bathroom, has_ac, has_balcony, floor, area_sqft, description, position",
        )
        .eq("property_id", propertyId)
        .is("deleted_at", null)
        .order("position")
        .order("name"),
      supabase
        .from("beds")
        .select("id, room_id, label, status, available_from, rent_override")
        .eq("property_id", propertyId)
        .order("label"),
      supabase
        .from("property_media")
        .select("id, room_id, storage_path, alt_text, width, height, position, is_cover")
        .eq("property_id", propertyId)
        .eq("kind", "image")
        .order("is_cover", { ascending: false })
        .order("position")
        .limit(40),
      supabase
        .from("property_amenities")
        .select("amenity_code, amenities(code, name, category, icon, position)")
        .eq("property_id", propertyId),
      supabase.from("property_rules").select("rule_code, allowed, value, note").eq("property_id", propertyId),
      supabase
        .from("property_charges")
        .select("id, label, amount, frequency, is_mandatory, position")
        .eq("property_id", propertyId)
        .order("position"),
      supabase
        .from("property_availability")
        .select("status, available_from, min_stay_months, notice_period_days")
        .eq("property_id", propertyId)
        .maybeSingle(),
      supabase
        .from("property_verifications")
        .select("status, verified_at, expires_at")
        .eq("property_id", propertyId)
        .eq("kind", "authorisation")
        .maybeSingle(),
      supabase
        .from("property_owner_cards")
        .select("user_id, display_name, owner_type, verification_status, verified_at, member_since")
        .eq("user_id", ownerId)
        .maybeSingle(),
      supabase
        .from("property_reviews")
        .select("id, author_id, rating, title, body, created_at, owner_replies(body, created_at)")
        .eq("property_id", propertyId)
        .eq("status", "published")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
  for (const result of [rooms, beds, media, amenities, rules, charges, availability, authorisation, owner, reviews]) {
    if (result.error) throw fromSupabaseError(result.error);
  }
  return {
    rooms: rooms.data ?? [],
    beds: beds.data ?? [],
    media: media.data ?? [],
    amenities: amenities.data ?? [],
    rules: rules.data ?? [],
    charges: charges.data ?? [],
    availability: availability.data,
    authorisation: authorisation.data,
    owner: owner.data,
    reviews: reviews.data ?? [],
  };
}

export async function fetchUserCards(supabase: AppSupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.from("public_user_cards").select("user_id, display_name").in("user_id", userIds);
  if (error) throw fromSupabaseError(error);
  return data;
}

// ───────────────────────────── seeker actions (user-scoped client) ─────────────────────────────

const SAVED_PROPERTY_COLUMNS = `property_id, created_at,
  property:properties(id, slug, title, property_type, listing_mode, locality, city, min_rent, monthly_rent,
    available_beds, total_beds, cover_media_path, rating_avg, rating_count, status, deleted_at)`;

export async function listSavedProperties(
  supabase: AppSupabaseClient,
  userId: string,
  range: { from: number; to: number },
) {
  const { data, error, count } = await supabase
    .from("saved_properties")
    .select(SAVED_PROPERTY_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  if (error) throw fromSupabaseError(error);
  return { rows: data, total: count ?? 0 };
}

export async function listSavedPropertyIds(supabase: AppSupabaseClient, userId: string, max: number) {
  const { data, error } = await supabase
    .from("saved_properties")
    .select("property_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) throw fromSupabaseError(error);
  return data.map((row) => row.property_id);
}

/** Idempotent: saving twice is not an error (ON CONFLICT DO NOTHING; needs only INSERT). */
export async function insertSavedProperty(supabase: AppSupabaseClient, userId: string, propertyId: string) {
  const { error } = await supabase
    .from("saved_properties")
    .upsert({ user_id: userId, property_id: propertyId }, { onConflict: "user_id,property_id", ignoreDuplicates: true });
  if (error) throw fromSupabaseError(error);
}

export async function deleteSavedProperty(supabase: AppSupabaseClient, userId: string, propertyId: string) {
  const { error } = await supabase.from("saved_properties").delete().eq("user_id", userId).eq("property_id", propertyId);
  if (error) throw fromSupabaseError(error);
}

export async function createInquiry(supabase: AppSupabaseClient, propertyId: string, input: InquiryInput) {
  const { data, error } = await supabase.rpc("create_property_inquiry", {
    p_property_id: propertyId,
    p_message: input.message,
    p_move_in_date: input.move_in_date ?? undefined,
    p_occupants: input.occupants,
    p_room_id: input.room_id ?? undefined,
  });
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function revealOwnerContact(supabase: AppSupabaseClient, propertyId: string) {
  const { data, error } = await supabase.rpc("reveal_owner_contact", { p_property_id: propertyId });
  if (error) throw fromSupabaseError(error);
  return data[0] ?? null;
}

export async function listOwnInquiries(
  supabase: AppSupabaseClient,
  userId: string,
  range: { from: number; to: number },
) {
  const { data, error, count } = await supabase
    .from("property_inquiries")
    .select(
      "id, status, message, move_in_date, occupants, created_at, owner_responded_at, property:properties(id, slug, title, locality, city)",
      { count: "exact" },
    )
    .eq("seeker_id", userId)
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  if (error) throw fromSupabaseError(error);
  return { rows: data, total: count ?? 0 };
}
