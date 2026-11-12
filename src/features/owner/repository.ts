import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

import type {
  BecomeOwnerInput,
  ListingStatus,
  OwnerProfileInput,
  RuleRow,
  SetListingStatusInput,
} from "./schemas";

/**
 * Owner portal data access, always with the caller's own session. What protects the data:
 *  - RLS: owners see and write only rows of their own properties (file 208); seekers' enquiries
 *    are readable by the owner of the enquired property; staff read everything.
 *  - Column grants: status, lifecycle stamps, slug, denormalised and verification columns have
 *    no INSERT/UPDATE grant, so they cannot be written from here at all.
 *  - SECURITY DEFINER functions for becoming an owner and every lifecycle change.
 * Repositories select explicit columns and never trust an id for authorisation.
 */

type Tables = Database["public"]["Tables"];
type PropertyInsert = Tables["properties"]["Insert"];
type PropertyUpdate = Tables["properties"]["Update"];
type RoomInsert = Tables["rooms"]["Insert"];
type RoomUpdate = Tables["rooms"]["Update"];
type BedUpdate = Tables["beds"]["Update"];
type AvailabilityUpdate = Tables["property_availability"]["Update"];
type ChargeInsert = Tables["property_charges"]["Insert"];
type MediaInsert = Tables["property_media"]["Insert"];

export const PROPERTY_MEDIA_BUCKET = "property-media";

function check(error: unknown): void {
  if (error) throw fromSupabaseError(error);
}

// ───────────────────────────── owner account ─────────────────────────────

export async function becomeOwner(supabase: AppSupabaseClient, input: BecomeOwnerInput): Promise<void> {
  const { error } = await supabase.rpc("become_owner", {
    p_owner_type: input.owner_type,
    p_contact_phone: input.contact_phone,
    p_business_name: input.business_name ?? undefined,
    p_contact_email: input.contact_email ?? undefined,
    p_whatsapp_number: input.whatsapp_number ?? undefined,
  });
  check(error);
}

export async function fetchOwnerAccount(supabase: AppSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("property_owners")
    .select("owner_type, business_name, contact_phone, contact_email, whatsapp_number, about, verification_status, verified_at, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  check(error);
  return data;
}

export async function updateOwnerAccount(supabase: AppSupabaseClient, userId: string, input: OwnerProfileInput): Promise<void> {
  const { error } = await supabase
    .from("property_owners")
    .update({
      owner_type: input.owner_type,
      business_name: input.business_name,
      contact_phone: input.contact_phone,
      contact_email: input.contact_email,
      whatsapp_number: input.whatsapp_number,
      about: input.about,
    })
    .eq("user_id", userId);
  check(error);
}

// ───────────────────────────── reference data ─────────────────────────────

export async function listCities(supabase: AppSupabaseClient) {
  const { data, error } = await supabase.from("cities").select("slug, name, state, location").eq("is_active", true).order("name");
  check(error);
  return data ?? [];
}

export async function listAmenities(supabase: AppSupabaseClient) {
  const { data, error } = await supabase.from("amenities").select("code, name, category, position").order("position");
  check(error);
  return data ?? [];
}

// ───────────────────────────── properties ─────────────────────────────

const SUMMARY_COLUMNS =
  "id, slug, title, status, rejection_reason, listing_mode, property_type, locality, city, min_rent, max_rent, monthly_rent, total_beds, available_beds, cover_media_path, last_confirmed_at, submitted_at, published_at, updated_at";

export async function listOwnerProperties(supabase: AppSupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select(SUMMARY_COLUMNS)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  check(error);
  return data ?? [];
}

const DETAIL_COLUMNS =
  "id, owner_id, slug, title, description, property_type, listing_mode, tenant_gender, furnishing, address_line, locality, city, state, pincode, landmark, location, monthly_rent, security_deposit, maintenance_monthly, electricity_billing, electricity_monthly_estimate, water_billing, water_monthly_estimate, food_available, food_included, food_monthly_charge, meals_breakfast, meals_lunch, meals_dinner, status, rejection_reason, submitted_at, published_at, last_confirmed_at, total_beds, available_beds";

/** The owner's own listing (null when it does not exist or is not theirs). */
export async function fetchOwnProperty(supabase: AppSupabaseClient, ownerId: string, propertyId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select(DETAIL_COLUMNS)
    .eq("id", propertyId)
    .eq("owner_id", ownerId)
    .is("deleted_at", null)
    .maybeSingle();
  check(error);
  return data;
}

export async function fetchPropertyChildren(supabase: AppSupabaseClient, propertyId: string) {
  const [rooms, beds, media, amenities, rules, charges, availability] = await Promise.all([
    supabase
      .from("rooms")
      .select("id, name, room_type, capacity, rent_per_bed, security_deposit, has_attached_bathroom, has_ac, has_balcony, floor, description, position, created_at")
      .eq("property_id", propertyId)
      .is("deleted_at", null)
      .order("position")
      .order("created_at"),
    supabase
      .from("beds")
      .select("id, room_id, label, status, available_from, rent_override, created_at")
      .eq("property_id", propertyId)
      .order("created_at"),
    supabase
      .from("property_media")
      .select("id, storage_path, alt_text, width, height, position, is_cover, created_at")
      .eq("property_id", propertyId)
      .eq("kind", "image")
      .order("position")
      .order("created_at"),
    supabase.from("property_amenities").select("amenity_code").eq("property_id", propertyId),
    supabase.from("property_rules").select("rule_code, allowed, value, note").eq("property_id", propertyId),
    supabase
      .from("property_charges")
      .select("id, label, amount, frequency, is_mandatory, position")
      .eq("property_id", propertyId)
      .order("position"),
    supabase
      .from("property_availability")
      .select("status, available_from, min_stay_months, notice_period_days, last_confirmed_at")
      .eq("property_id", propertyId)
      .maybeSingle(),
  ]);
  for (const result of [rooms, beds, media, amenities, rules, charges, availability]) check(result.error);
  return {
    rooms: rooms.data ?? [],
    beds: beds.data ?? [],
    media: media.data ?? [],
    amenities: amenities.data ?? [],
    rules: rules.data ?? [],
    charges: charges.data ?? [],
    availability: availability.data,
  };
}

/** `slug` is set by trigger (and has no INSERT grant), so it is never sent. */
export async function insertProperty(supabase: AppSupabaseClient, values: Omit<PropertyInsert, "slug">): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("properties")
    .insert(values as PropertyInsert)
    .select("id")
    .single();
  check(error);
  return data!;
}

/** Updates the caller's own listing. Returns false when no row matched (not theirs / deleted). */
export async function updateProperty(supabase: AppSupabaseClient, propertyId: string, values: PropertyUpdate): Promise<boolean> {
  const { data, error } = await supabase.from("properties").update(values).eq("id", propertyId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

// ───────────────────────────── rooms and beds ─────────────────────────────

export async function insertRoom(supabase: AppSupabaseClient, values: RoomInsert): Promise<{ id: string }> {
  const { data, error } = await supabase.from("rooms").insert(values).select("id").single();
  check(error);
  return data!;
}

export async function updateRoom(supabase: AppSupabaseClient, roomId: string, values: RoomUpdate): Promise<boolean> {
  const { data, error } = await supabase.from("rooms").update(values).eq("id", roomId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function deleteRoom(supabase: AppSupabaseClient, roomId: string): Promise<boolean> {
  const { data, error } = await supabase.from("rooms").delete().eq("id", roomId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function nextRoomPosition(supabase: AppSupabaseClient, propertyId: string): Promise<number> {
  const { data, error } = await supabase
    .from("rooms")
    .select("position")
    .eq("property_id", propertyId)
    .order("position", { ascending: false })
    .limit(1);
  check(error);
  return Math.min(32_000, (data?.[0]?.position ?? -1) + 1);
}

/**
 * property_id is overwritten from the room by trigger (whatever is sent), then the insert policy
 * checks that the property is the caller's and the capacity trigger checks the room has space.
 */
export async function insertBed(supabase: AppSupabaseClient, room: { id: string; property_id: string }, label: string): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("beds")
    .insert({ room_id: room.id, property_id: room.property_id, label })
    .select("id")
    .single();
  check(error);
  return data!;
}

export async function fetchRoom(supabase: AppSupabaseClient, roomId: string) {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, property_id, capacity, deleted_at")
    .eq("id", roomId)
    .maybeSingle();
  check(error);
  return data;
}

export async function fetchBed(supabase: AppSupabaseClient, bedId: string) {
  const { data, error } = await supabase.from("beds").select("id, property_id, room_id").eq("id", bedId).maybeSingle();
  check(error);
  return data;
}

export async function listBedLabels(supabase: AppSupabaseClient, roomId: string): Promise<string[]> {
  const { data, error } = await supabase.from("beds").select("label").eq("room_id", roomId);
  check(error);
  return (data ?? []).map((row) => row.label);
}

export async function updateBed(supabase: AppSupabaseClient, bedId: string, values: BedUpdate): Promise<boolean> {
  const { data, error } = await supabase.from("beds").update(values).eq("id", bedId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function deleteBed(supabase: AppSupabaseClient, bedId: string): Promise<boolean> {
  const { data, error } = await supabase.from("beds").delete().eq("id", bedId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

// ───────────────────────────── availability, amenities, rules, charges ─────────────────────────────

export async function updateAvailability(supabase: AppSupabaseClient, propertyId: string, values: AvailabilityUpdate): Promise<boolean> {
  const { data, error } = await supabase.from("property_availability").update(values).eq("property_id", propertyId).select("property_id");
  check(error);
  return (data ?? []).length > 0;
}

export async function replaceAmenities(supabase: AppSupabaseClient, propertyId: string, codes: readonly string[]): Promise<void> {
  const { data: current, error } = await supabase.from("property_amenities").select("amenity_code").eq("property_id", propertyId);
  check(error);
  const have = new Set((current ?? []).map((row) => row.amenity_code));
  const want = new Set(codes);
  const remove = [...have].filter((code) => !want.has(code));
  const add = [...want].filter((code) => !have.has(code));
  if (remove.length) {
    const { error: deleteError } = await supabase.from("property_amenities").delete().eq("property_id", propertyId).in("amenity_code", remove);
    check(deleteError);
  }
  if (add.length) {
    const { error: insertError } = await supabase
      .from("property_amenities")
      .insert(add.map((amenity_code) => ({ property_id: propertyId, amenity_code })));
    check(insertError);
  }
}

/** Rules have no dependants, so the set is replaced: delete what is gone, update or insert the rest. */
export async function replaceRules(supabase: AppSupabaseClient, propertyId: string, rows: readonly RuleRow[]): Promise<void> {
  const { data: current, error } = await supabase.from("property_rules").select("rule_code").eq("property_id", propertyId);
  check(error);
  const have = new Set((current ?? []).map((row) => row.rule_code));
  const want = new Set(rows.map((row) => row.rule_code));
  const remove = [...have].filter((code) => !want.has(code));
  if (remove.length) {
    const { error: deleteError } = await supabase.from("property_rules").delete().eq("property_id", propertyId).in("rule_code", remove);
    check(deleteError);
  }
  for (const row of rows) {
    if (have.has(row.rule_code)) {
      const { error: updateError } = await supabase
        .from("property_rules")
        .update({ allowed: row.allowed, value: row.value, note: row.note })
        .eq("property_id", propertyId)
        .eq("rule_code", row.rule_code);
      check(updateError);
    } else {
      const { error: insertError } = await supabase.from("property_rules").insert({ property_id: propertyId, ...row });
      check(insertError);
    }
  }
}

export async function replaceCharges(supabase: AppSupabaseClient, propertyId: string, rows: readonly ChargeInsert[]): Promise<void> {
  const { error } = await supabase.from("property_charges").delete().eq("property_id", propertyId);
  check(error);
  if (rows.length) {
    const { error: insertError } = await supabase.from("property_charges").insert([...rows]);
    check(insertError);
  }
}

// ───────────────────────────── media ─────────────────────────────

export async function mediaStats(supabase: AppSupabaseClient, propertyId: string): Promise<{ count: number; maxPosition: number; hasCover: boolean }> {
  const { data, error } = await supabase.from("property_media").select("position, is_cover").eq("property_id", propertyId);
  check(error);
  const rows = data ?? [];
  return {
    count: rows.length,
    maxPosition: rows.reduce((max, row) => Math.max(max, row.position), -1),
    hasCover: rows.some((row) => row.is_cover),
  };
}

export async function insertMedia(supabase: AppSupabaseClient, values: MediaInsert) {
  const { data, error } = await supabase
    .from("property_media")
    .insert(values)
    .select("id, storage_path, alt_text, width, height, position, is_cover")
    .single();
  check(error);
  return data!;
}

export async function fetchMedia(supabase: AppSupabaseClient, mediaId: string) {
  const { data, error } = await supabase
    .from("property_media")
    .select("id, property_id, storage_path, is_cover, position")
    .eq("id", mediaId)
    .maybeSingle();
  check(error);
  return data;
}

export async function setCover(supabase: AppSupabaseClient, mediaId: string): Promise<boolean> {
  const { data, error } = await supabase.from("property_media").update({ is_cover: true }).eq("id", mediaId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function setMediaPosition(supabase: AppSupabaseClient, propertyId: string, mediaId: string, position: number): Promise<void> {
  const { error } = await supabase.from("property_media").update({ position }).eq("id", mediaId).eq("property_id", propertyId);
  check(error);
}

export async function deleteMediaRow(supabase: AppSupabaseClient, mediaId: string): Promise<boolean> {
  const { data, error } = await supabase.from("property_media").delete().eq("id", mediaId).select("id");
  check(error);
  return (data ?? []).length > 0;
}

/** Storage delete through the caller's session: the bucket policy allows only the property's owner. */
export async function removeStorageObjects(supabase: AppSupabaseClient, paths: readonly string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(PROPERTY_MEDIA_BUCKET).remove([...paths]);
  check(error);
}

export async function firstMediaId(supabase: AppSupabaseClient, propertyId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("property_media")
    .select("id")
    .eq("property_id", propertyId)
    .eq("kind", "image")
    .order("position")
    .order("created_at")
    .limit(1);
  check(error);
  return data?.[0]?.id ?? null;
}

// ───────────────────────────── lifecycle (SECURITY DEFINER functions) ─────────────────────────────

export async function submitForReview(supabase: AppSupabaseClient, propertyId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("submit_property_for_review", { p_property_id: propertyId });
  check(error);
  return data ?? [];
}

export async function setListingStatus(supabase: AppSupabaseClient, input: SetListingStatusInput): Promise<void> {
  const { error } = await supabase.rpc("owner_set_listing_status", { p_property_id: input.property_id, p_status: input.status });
  check(error);
}

export async function confirmListing(supabase: AppSupabaseClient, propertyId: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_listing", { p_property_id: propertyId });
  check(error);
}

// ───────────────────────────── enquiries, stats, reviews, verification ─────────────────────────────

/** start_inquiry_conversation (messaging stage): the seeker or the property's owner only. */
export async function startInquiryConversation(supabase: AppSupabaseClient, inquiryId: string): Promise<string> {
  const { data, error } = await supabase.rpc("start_inquiry_conversation", { p_inquiry_id: inquiryId });
  check(error);
  return data as string;
}

export async function listInquiries(supabase: AppSupabaseClient, ownerId: string, limit: number) {
  const { data, error } = await supabase
    .from("property_inquiries")
    .select("id, property_id, seeker_id, message, move_in_date, occupants, status, conversation_id, created_at, properties!inner(title, owner_id)")
    .eq("properties.owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  check(error);
  return data ?? [];
}

export async function countNewInquiries(supabase: AppSupabaseClient, ownerId: string): Promise<number> {
  const { count, error } = await supabase
    .from("property_inquiries")
    .select("id, properties!inner(owner_id)", { count: "exact", head: true })
    .eq("properties.owner_id", ownerId)
    .eq("status", "new");
  check(error);
  return count ?? 0;
}

/** Safe public names (public_user_cards view) for a set of user ids. */
export async function fetchUserCards(supabase: AppSupabaseClient, userIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("public_user_cards").select("user_id, display_name").in("user_id", ids);
  check(error);
  return new Map((data ?? []).map((row) => [row.user_id, row.display_name]));
}

export async function listStats(supabase: AppSupabaseClient, propertyIds: readonly string[], sinceDay: string) {
  if (!propertyIds.length) return [];
  const { data, error } = await supabase
    .from("property_stats_daily")
    .select("property_id, views, saves, inquiries, contact_reveals")
    .in("property_id", [...propertyIds])
    .gte("day", sinceDay);
  check(error);
  return data ?? [];
}

export async function listReviews(supabase: AppSupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("property_reviews")
    .select("id, property_id, author_id, rating, title, body, created_at, properties!inner(title, owner_id), owner_replies(body, updated_at)")
    .eq("properties.owner_id", ownerId)
    .eq("status", "published")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  check(error);
  return data ?? [];
}

export async function upsertReply(supabase: AppSupabaseClient, ownerId: string, reviewId: string, body: string): Promise<void> {
  const { data, error } = await supabase.from("owner_replies").update({ body }).eq("review_id", reviewId).select("review_id");
  check(error);
  if ((data ?? []).length > 0) return;
  const { error: insertError } = await supabase.from("owner_replies").insert({ review_id: reviewId, owner_id: ownerId, body });
  check(insertError);
}

export async function listVerificationRecords(supabase: AppSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("verification_records")
    .select("id, subject_type, kind, status, review_note, created_at, reviewed_at")
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  check(error);
  return data ?? [];
}

export type StatusCounts = Record<ListingStatus, number>;
