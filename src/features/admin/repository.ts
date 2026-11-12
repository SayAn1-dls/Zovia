import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

import type { ContactUpdateInput, ListingStatus, ReviewDecisionInput } from "./schemas";

/**
 * Admin data access with the staff member's own session. Every read relies on the staff RLS
 * policies (`is_staff()`); the only writes are admin_review_property() (SECURITY DEFINER, checks
 * is_staff and writes the audit log) and the contact-message status/note (staff UPDATE policy +
 * column grant). No service-role client anywhere.
 */

function check(error: unknown): void {
  if (error) throw fromSupabaseError(error);
}

const LISTING_STATUSES: ListingStatus[] = ["draft", "pending_review", "published", "paused", "rejected", "archived"];

export async function countRows(
  supabase: AppSupabaseClient,
  table: "users" | "property_owners" | "contact_messages" | "verification_records",
  filter?: { column: string; value: string },
): Promise<number> {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) query = query.eq(filter.column, filter.value);
  const { count, error } = await query;
  check(error);
  return count ?? 0;
}

export async function countListingsByStatus(supabase: AppSupabaseClient): Promise<Record<ListingStatus, number>> {
  const results = await Promise.all(
    LISTING_STATUSES.map((status) =>
      supabase.from("properties").select("id", { count: "exact", head: true }).eq("status", status).is("deleted_at", null),
    ),
  );
  const out = {} as Record<ListingStatus, number>;
  results.forEach((result, index) => {
    check(result.error);
    out[LISTING_STATUSES[index]!] = result.count ?? 0;
  });
  return out;
}

export async function listListings(supabase: AppSupabaseClient, status: ListingStatus, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("properties")
    .select(
      "id, slug, title, status, property_type, listing_mode, locality, city, owner_id, submitted_at, updated_at, rejection_reason, cover_media_path",
      { count: "exact" },
    )
    .eq("status", status)
    .is("deleted_at", null)
    // The review queue is first come, first served; other lists show the latest changes first.
    .order(status === "pending_review" ? "submitted_at" : "updated_at", { ascending: status === "pending_review", nullsFirst: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function fetchListing(supabase: AppSupabaseClient, propertyId: string) {
  const { data, error } = await supabase
    .from("properties")
    .select(
      "id, owner_id, slug, title, description, status, rejection_reason, property_type, listing_mode, tenant_gender, furnishing, address_line, locality, city, state, pincode, landmark, location, monthly_rent, security_deposit, maintenance_monthly, electricity_billing, electricity_monthly_estimate, water_billing, water_monthly_estimate, food_available, food_included, food_monthly_charge, min_rent, max_rent, total_beds, available_beds, submitted_at, published_at, created_at",
    )
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();
  check(error);
  return data;
}

export async function fetchListingChildren(supabase: AppSupabaseClient, propertyId: string) {
  const [rooms, beds, media, amenities, rules, charges, availability] = await Promise.all([
    supabase.from("rooms").select("id, name, capacity, rent_per_bed, position").eq("property_id", propertyId).is("deleted_at", null).order("position"),
    supabase.from("beds").select("room_id, label, status").eq("property_id", propertyId).order("label"),
    supabase.from("property_media").select("id, storage_path, is_cover, position").eq("property_id", propertyId).order("position"),
    supabase.from("property_amenities").select("amenity_code, amenities(name)").eq("property_id", propertyId),
    supabase.from("property_rules").select("rule_code, allowed, value, note").eq("property_id", propertyId),
    supabase.from("property_charges").select("label, amount, frequency, is_mandatory, position").eq("property_id", propertyId).order("position"),
    supabase.from("property_availability").select("status, available_from").eq("property_id", propertyId).maybeSingle(),
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

export async function fetchOwner(supabase: AppSupabaseClient, ownerId: string) {
  const { data, error } = await supabase
    .from("property_owners")
    .select("user_id, owner_type, business_name, contact_phone, verification_status, created_at, users!property_owners_user_id_fkey(email)")
    .eq("user_id", ownerId)
    .maybeSingle();
  check(error);
  return data;
}

/** Display names of any users (staff can read user_profiles; the card view also covers it). */
export async function fetchNames(supabase: AppSupabaseClient, userIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!ids.length) return new Map();
  const { data, error } = await supabase.from("user_profiles").select("user_id, display_name").in("user_id", ids);
  check(error);
  return new Map((data ?? []).map((row) => [row.user_id, row.display_name]));
}

export async function reviewProperty(supabase: AppSupabaseClient, input: ReviewDecisionInput): Promise<void> {
  const { error } = await supabase.rpc("admin_review_property", {
    p_property_id: input.property_id,
    p_approve: input.approve,
    p_reason: input.reason ?? undefined,
  });
  check(error);
}

export async function listUsers(supabase: AppSupabaseClient, search: string | null, range: { from: number; to: number }) {
  let query = supabase
    .from("users")
    .select("id, email, status, onboarding_completed_at, created_at, user_profiles(display_name), user_roles!user_roles_user_id_fkey(role)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  if (search) query = query.ilike("email", `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data, error, count } = await query;
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listOwners(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("property_owners")
    .select("user_id, owner_type, business_name, contact_phone, verification_status, created_at, users!property_owners_user_id_fkey(email)", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listContactMessages(supabase: AppSupabaseClient, status: string | null, range: { from: number; to: number }) {
  let query = supabase
    .from("contact_messages")
    .select("id, name, email, phone, subject, message, status, staff_note, created_at, handled_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  if (status) query = query.eq("status", status);
  const { data, error, count } = await query;
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function updateContactMessage(supabase: AppSupabaseClient, input: ContactUpdateInput): Promise<boolean> {
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ status: input.status, staff_note: input.staff_note })
    .eq("id", input.id)
    .select("id");
  check(error);
  return (data ?? []).length > 0;
}

export async function listAuditLogs(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("admin_audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listVerificationRecords(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("verification_records")
    .select("id, subject_type, subject_id, submitted_by, kind, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listReviews(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("property_reviews")
    .select("id, author_id, rating, title, body, status, created_at, properties(title)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listReports(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("reports")
    .select("id, reporter_id, target_type, target_id, reason_code, details, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listMessageReports(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("message_reports")
    .select("id, reporter_id, reported_user_id, reason, details, status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listAppeals(supabase: AppSupabaseClient, range: { from: number; to: number }) {
  const { data, error, count } = await supabase
    .from("appeals")
    .select("id, user_id, statement, status, decision_note, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(range.from, range.to);
  check(error);
  return { rows: data ?? [], total: count ?? 0 };
}

export async function listSettings(supabase: AppSupabaseClient) {
  const { data, error } = await supabase.from("platform_settings").select("key, value, description, updated_at").order("key");
  check(error);
  return data ?? [];
}

/** Aggregate counts for the overview (admin_dashboard_stats: SECURITY DEFINER, re-checks is_staff()). */
export async function fetchDashboardStats(supabase: AppSupabaseClient): Promise<unknown> {
  const { data, error } = await supabase.rpc("admin_dashboard_stats");
  check(error);
  return data;
}
