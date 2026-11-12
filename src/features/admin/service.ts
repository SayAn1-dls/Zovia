import "server-only";

import { notFound } from "next/navigation";

import { invalidateListingCache, parsePoint, propertyMediaUrl } from "@/features/owner/service";
import { getServiceContext, isStaff, type UserServiceContext } from "@/server/auth";
import { errors } from "@/server/http/errors";

import * as repo from "./repository";
import {
  ADMIN_PAGE_SIZE,
  parseAdminAnalytics,
  type AdminAnalytics,
  type AdminAuditRow,
  type AdminContactMessage,
  type AdminListingDetail,
  type AdminListingRow,
  type AdminModerationRow,
  type AdminOwnerRow,
  type AdminReviewRow,
  type AdminSettingRow,
  type AdminStats,
  type AdminUserRow,
  type AdminVerificationRow,
  type ContactStatus,
  type ContactUpdateInput,
  type ListingStatus,
  type Paged,
  type ReviewDecisionInput,
} from "./schemas";

/**
 * Admin business logic. Staff-only: pages call `staffPageContext()`, actions and routes use the
 * "staff" auth level, and RLS (`is_staff()`) plus admin_review_property() enforce it again.
 */

/** Server-side guard for admin pages: anyone who is not active staff gets a 404 (like the proxy). */
export async function staffPageContext(): Promise<UserServiceContext> {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user || !isStaff(user)) notFound();
  return { supabase, user, requestId };
}

function range(page: number) {
  const from = (page - 1) * ADMIN_PAGE_SIZE;
  return { from, to: from + ADMIN_PAGE_SIZE - 1 };
}

function paged<T>(rows: T[], total: number, page: number): Paged<T> {
  return { rows, total, page, page_size: ADMIN_PAGE_SIZE };
}

export async function getStats(ctx: UserServiceContext): Promise<AdminStats> {
  const [users, owners, listings, contactNew, contactTotal, verificationsPending] = await Promise.all([
    repo.countRows(ctx.supabase, "users"),
    repo.countRows(ctx.supabase, "property_owners"),
    repo.countListingsByStatus(ctx.supabase),
    repo.countRows(ctx.supabase, "contact_messages", { column: "status", value: "new" }),
    repo.countRows(ctx.supabase, "contact_messages"),
    repo.countRows(ctx.supabase, "verification_records", { column: "status", value: "pending" }),
  ]);
  return {
    users,
    owners,
    listings,
    contact_messages_new: contactNew,
    contact_messages_total: contactTotal,
    verifications_pending: verificationsPending,
  };
}

/** Platform analytics for the overview: real counts from admin_dashboard_stats(). */
export async function getAnalytics(ctx: UserServiceContext): Promise<AdminAnalytics> {
  return parseAdminAnalytics(await repo.fetchDashboardStats(ctx.supabase));
}

export async function listListings(ctx: UserServiceContext, status: ListingStatus, page: number): Promise<Paged<AdminListingRow>> {
  const { rows, total } = await repo.listListings(ctx.supabase, status, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.owner_id));
  return paged(
    rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      property_type: row.property_type,
      listing_mode: row.listing_mode,
      locality: row.locality,
      city: row.city,
      owner_name: names.get(row.owner_id) ?? "Unknown owner",
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      rejection_reason: row.rejection_reason,
      cover_url: row.cover_media_path ? propertyMediaUrl(row.cover_media_path) : null,
    })),
    total,
    page,
  );
}

export async function getListing(ctx: UserServiceContext, propertyId: string): Promise<AdminListingDetail> {
  const row = await repo.fetchListing(ctx.supabase, propertyId);
  if (!row) throw errors.notFound("Listing not found.");
  const [children, owner, names] = await Promise.all([
    repo.fetchListingChildren(ctx.supabase, propertyId),
    repo.fetchOwner(ctx.supabase, row.owner_id),
    repo.fetchNames(ctx.supabase, [row.owner_id]),
  ]);
  const ownerEmail = owner ? (Array.isArray(owner.users) ? owner.users[0]?.email : owner.users?.email) ?? null : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    status: row.status,
    rejection_reason: row.rejection_reason,
    property_type: row.property_type,
    listing_mode: row.listing_mode,
    tenant_gender: row.tenant_gender,
    furnishing: row.furnishing,
    address: [row.address_line, row.landmark, row.locality, row.city, row.state, row.pincode].filter(Boolean).join(", "),
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
    min_rent: row.min_rent,
    max_rent: row.max_rent,
    total_beds: row.total_beds,
    available_beds: row.available_beds,
    submitted_at: row.submitted_at,
    published_at: row.published_at,
    created_at: row.created_at,
    owner: owner
      ? {
          user_id: owner.user_id,
          display_name: owner.business_name ?? names.get(owner.user_id) ?? "Unknown owner",
          email: ownerEmail,
          owner_type: owner.owner_type,
          business_name: owner.business_name,
          contact_phone: owner.contact_phone,
          verification_status: owner.verification_status,
          member_since: owner.created_at,
        }
      : null,
    rooms: children.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      capacity: room.capacity,
      rent_per_bed: room.rent_per_bed,
      beds: children.beds.filter((bed) => bed.room_id === room.id).map((bed) => ({ label: bed.label, status: bed.status })),
    })),
    photos: children.media.map((item) => ({ id: item.id, url: propertyMediaUrl(item.storage_path), is_cover: item.is_cover })),
    amenities: children.amenities.map((item) => {
      const amenity = Array.isArray(item.amenities) ? item.amenities[0] : item.amenities;
      return amenity?.name ?? item.amenity_code;
    }),
    rules: children.rules,
    charges: children.charges.map(({ label, amount, frequency, is_mandatory }) => ({ label, amount, frequency, is_mandatory })),
    availability: children.availability,
  };
}

export async function reviewListing(ctx: UserServiceContext, input: ReviewDecisionInput): Promise<{ status: ListingStatus }> {
  const listing = await repo.fetchListing(ctx.supabase, input.property_id);
  if (!listing) throw errors.notFound("Listing not found.");
  await repo.reviewProperty(ctx.supabase, input);
  invalidateListingCache(listing.slug);
  return { status: input.approve ? "published" : "rejected" };
}

export async function listUsers(ctx: UserServiceContext, search: string | null, page: number): Promise<Paged<AdminUserRow>> {
  const { rows, total } = await repo.listUsers(ctx.supabase, search, range(page));
  return paged(
    rows.map((row) => {
      const profile = Array.isArray(row.user_profiles) ? row.user_profiles[0] : row.user_profiles;
      return {
        id: row.id,
        email: row.email,
        display_name: profile?.display_name ?? "—",
        status: row.status,
        roles: (row.user_roles ?? []).map((r) => r.role),
        onboarded: row.onboarding_completed_at !== null,
        created_at: row.created_at,
      };
    }),
    total,
    page,
  );
}

export async function listOwners(ctx: UserServiceContext, page: number): Promise<Paged<AdminOwnerRow>> {
  const { rows, total } = await repo.listOwners(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.user_id));
  return paged(
    rows.map((row) => ({
      user_id: row.user_id,
      display_name: names.get(row.user_id) ?? "—",
      email: (Array.isArray(row.users) ? row.users[0]?.email : row.users?.email) ?? null,
      owner_type: row.owner_type,
      business_name: row.business_name,
      contact_phone: row.contact_phone,
      verification_status: row.verification_status,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listContactMessages(ctx: UserServiceContext, status: ContactStatus | null, page: number): Promise<Paged<AdminContactMessage>> {
  const { rows, total } = await repo.listContactMessages(ctx.supabase, status, range(page));
  return paged(
    rows.map((row) => ({ ...row, email: String(row.email), status: row.status as ContactStatus })),
    total,
    page,
  );
}

export async function updateContactMessage(ctx: UserServiceContext, input: ContactUpdateInput): Promise<void> {
  if (!(await repo.updateContactMessage(ctx.supabase, input))) throw errors.notFound("Message not found.");
}

export async function listAuditLogs(ctx: UserServiceContext, page: number): Promise<Paged<AdminAuditRow>> {
  const { rows, total } = await repo.listAuditLogs(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.actor_id));
  return paged(
    rows.map((row) => ({
      id: row.id,
      actor_name: row.actor_id ? (names.get(row.actor_id) ?? "Staff member") : "System",
      action: row.action,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      details: row.details,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listVerifications(ctx: UserServiceContext, page: number): Promise<Paged<AdminVerificationRow>> {
  const { rows, total } = await repo.listVerificationRecords(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.submitted_by));
  return paged(
    rows.map((row) => ({
      id: row.id,
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      submitter_name: names.get(row.submitted_by) ?? "—",
      kind: row.kind,
      status: row.status,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listReviews(ctx: UserServiceContext, page: number): Promise<Paged<AdminReviewRow>> {
  const { rows, total } = await repo.listReviews(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.author_id));
  return paged(
    rows.map((row) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      return {
        id: row.id,
        property_title: property?.title ?? "—",
        author_name: names.get(row.author_id) ?? "—",
        rating: row.rating,
        title: row.title,
        body: row.body,
        status: row.status,
        created_at: row.created_at,
      };
    }),
    total,
    page,
  );
}

const human = (value: string) => value.replace(/_/g, " ");

export async function listReports(ctx: UserServiceContext, page: number): Promise<Paged<AdminModerationRow>> {
  const { rows, total } = await repo.listReports(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.reporter_id));
  return paged(
    rows.map((row) => ({
      id: row.id,
      title: `${human(row.reason_code)} · ${human(row.target_type)}`,
      people: `Reported by ${row.reporter_id ? (names.get(row.reporter_id) ?? "a member") : "a former member"} · target ${row.target_id}`,
      details: row.details,
      status: row.status,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listMessageReports(ctx: UserServiceContext, page: number): Promise<Paged<AdminModerationRow>> {
  const { rows, total } = await repo.listMessageReports(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.flatMap((row) => [row.reporter_id, row.reported_user_id]));
  const name = (id: string | null) => (id ? (names.get(id) ?? "a member") : "a former member");
  return paged(
    rows.map((row) => ({
      id: row.id,
      title: human(row.reason),
      people: `${name(row.reporter_id)} reported ${name(row.reported_user_id)}`,
      details: row.details,
      status: row.status,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listAppeals(ctx: UserServiceContext, page: number): Promise<Paged<AdminModerationRow>> {
  const { rows, total } = await repo.listAppeals(ctx.supabase, range(page));
  const names = await repo.fetchNames(ctx.supabase, rows.map((row) => row.user_id));
  return paged(
    rows.map((row) => ({
      id: row.id,
      title: `Appeal by ${names.get(row.user_id) ?? "a member"}`,
      people: row.decision_note ? `Decision note: ${row.decision_note}` : "Not decided",
      details: row.statement,
      status: row.status,
      created_at: row.created_at,
    })),
    total,
    page,
  );
}

export async function listSettings(ctx: UserServiceContext): Promise<AdminSettingRow[]> {
  return repo.listSettings(ctx.supabase);
}
