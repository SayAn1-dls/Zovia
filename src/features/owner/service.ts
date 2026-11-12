import "server-only";

import type { UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";

import { invalidateListingCache } from "./cache";
import { listingGaps } from "./completeness";
import { parsePoint, toPointEwkt, nextBedLabel } from "./geo";
import * as repo from "./repository";
import {
  rulesToRows,
  type AddBedInput,
  type AmenitiesInput,
  type AmenityOption,
  type AvailabilityInput,
  type BasicsInput,
  type BecomeOwnerInput,
  type ChargesInput,
  type CityOption,
  type ListingStatus,
  type LocationInput,
  type OwnerAccount,
  type OwnerDashboard,
  type OwnerInquiry,
  type OwnerMedia,
  type OwnerProfileInput,
  type OwnerPropertyDetail,
  type OwnerPropertySummary,
  type OwnerReview,
  type OwnerRoom,
  type OwnerVerificationRecord,
  type PricingInput,
  type RegisterMediaInput,
  type ReorderMediaInput,
  type ReplyToReviewInput,
  type RoomInput,
  type RulesInput,
  type SetListingStatusInput,
  type SubmitResult,
  type UpdateBasicsInput,
  type UpdateBedInput,
  PROPERTY_MEDIA_MAX_COUNT,
} from "./schemas";

/**
 * Owner portal business logic. Every function works through the caller's own session
 * (`ctx.supabase`), so RLS, column grants and the lifecycle functions decide what is allowed;
 * the checks here only turn "no row matched" into a clear 404 and keep the UI honest.
 */

const NOT_FOUND = "Listing not found.";

/** For other modules (admin), which may import this service but not owner internals. */
export { parsePoint } from "./geo";
export { invalidateListingCache } from "./cache";

/** Expires the public caches of one listing (search + detail) after any change to it. */
async function touched(ctx: UserServiceContext, propertyId: string): Promise<void> {
  const row = await repo.fetchOwnProperty(ctx.supabase, ctx.user.id, propertyId);
  invalidateListingCache(row?.slug ?? null);
}

/** Public URL of an object in the public `property-media` bucket (spec 6.8). */
export function propertyMediaUrl(path: string): string {
  const base = env().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${repo.PROPERTY_MEDIA_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** YYYY-MM-DD in India, `daysAgo` days before today (property_stats_daily.day is an IST date). */
function istDay(daysAgo: number): string {
  const date = new Date(Date.now() - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// ───────────────────────────── account ─────────────────────────────

export async function becomeOwner(ctx: UserServiceContext, input: BecomeOwnerInput): Promise<void> {
  await repo.becomeOwner(ctx.supabase, input);
}

export async function getOwnerAccount(ctx: UserServiceContext): Promise<OwnerAccount | null> {
  return repo.fetchOwnerAccount(ctx.supabase, ctx.user.id);
}

export async function updateOwnerProfile(ctx: UserServiceContext, input: OwnerProfileInput): Promise<void> {
  await repo.updateOwnerAccount(ctx.supabase, ctx.user.id, input);
}

// ───────────────────────────── reference data ─────────────────────────────

export async function getEditorReference(ctx: UserServiceContext): Promise<{ cities: CityOption[]; amenities: AmenityOption[] }> {
  const [cities, amenities] = await Promise.all([repo.listCities(ctx.supabase), repo.listAmenities(ctx.supabase)]);
  return {
    cities: cities.map((city) => ({ slug: city.slug, name: city.name, state: city.state, center: parsePoint(city.location) })),
    amenities: amenities.map((amenity) => ({ code: amenity.code, name: amenity.name, category: amenity.category })),
  };
}

// ───────────────────────────── properties ─────────────────────────────

export async function listProperties(ctx: UserServiceContext): Promise<OwnerPropertySummary[]> {
  const rows = await repo.listOwnerProperties(ctx.supabase, ctx.user.id);
  return rows.map(({ cover_media_path, ...row }) => ({
    ...row,
    cover_url: cover_media_path ? propertyMediaUrl(cover_media_path) : null,
  }));
}

async function requireOwnProperty(ctx: UserServiceContext, propertyId: string) {
  const row = await repo.fetchOwnProperty(ctx.supabase, ctx.user.id, propertyId);
  if (!row) throw errors.notFound(NOT_FOUND);
  return row;
}

export async function getPropertyDetail(ctx: UserServiceContext, propertyId: string): Promise<OwnerPropertyDetail> {
  const row = await requireOwnProperty(ctx, propertyId);
  const children = await repo.fetchPropertyChildren(ctx.supabase, propertyId);

  const rooms: OwnerRoom[] = children.rooms.map((room) => ({
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
    description: room.description,
    position: room.position,
    beds: children.beds
      .filter((bed) => bed.room_id === room.id)
      .map((bed) => ({
        id: bed.id,
        room_id: bed.room_id,
        label: bed.label,
        status: bed.status,
        available_from: bed.available_from,
        rent_override: bed.rent_override,
      })),
  }));
  const media: OwnerMedia[] = children.media.map((item) => ({
    id: item.id,
    storage_path: item.storage_path,
    url: propertyMediaUrl(item.storage_path),
    alt_text: item.alt_text,
    width: item.width,
    height: item.height,
    position: item.position,
    is_cover: item.is_cover,
  }));

  const { location, ...rest } = row;
  return {
    id: rest.id,
    slug: rest.slug,
    title: rest.title,
    description: rest.description,
    property_type: rest.property_type,
    listing_mode: rest.listing_mode,
    tenant_gender: rest.tenant_gender,
    furnishing: rest.furnishing,
    address_line: rest.address_line,
    locality: rest.locality,
    city: rest.city,
    state: rest.state,
    pincode: rest.pincode,
    landmark: rest.landmark,
    monthly_rent: rest.monthly_rent,
    security_deposit: rest.security_deposit,
    maintenance_monthly: rest.maintenance_monthly,
    electricity_billing: rest.electricity_billing,
    electricity_monthly_estimate: rest.electricity_monthly_estimate,
    water_billing: rest.water_billing,
    water_monthly_estimate: rest.water_monthly_estimate,
    food_available: rest.food_available,
    food_included: rest.food_included,
    food_monthly_charge: rest.food_monthly_charge,
    meals_breakfast: rest.meals_breakfast,
    meals_lunch: rest.meals_lunch,
    meals_dinner: rest.meals_dinner,
    status: rest.status,
    rejection_reason: rest.rejection_reason,
    submitted_at: rest.submitted_at,
    published_at: rest.published_at,
    last_confirmed_at: rest.last_confirmed_at,
    total_beds: rest.total_beds,
    available_beds: rest.available_beds,
    location: parsePoint(location),
    rooms,
    media,
    amenity_codes: children.amenities.map((row) => row.amenity_code).sort(),
    rules: children.rules,
    charges: children.charges.map((charge) => ({
      id: charge.id,
      label: charge.label,
      amount: charge.amount,
      frequency: charge.frequency,
      is_mandatory: charge.is_mandatory,
    })),
    availability: children.availability,
  };
}

export async function createProperty(ctx: UserServiceContext, input: BasicsInput): Promise<{ id: string }> {
  // owner_id is always the caller; the insert policy re-checks it together with the owner role.
  return repo.insertProperty(ctx.supabase, {
    owner_id: ctx.user.id,
    title: input.title,
    property_type: input.property_type,
    listing_mode: input.listing_mode,
    tenant_gender: input.tenant_gender,
    furnishing: input.furnishing,
    description: input.description,
    // Sensible starting point for the pricing form; the owner changes them on the pricing step.
    electricity_billing: "metered",
    water_billing: "included",
  });
}

async function updateOwnProperty(ctx: UserServiceContext, propertyId: string, values: Parameters<typeof repo.updateProperty>[2]) {
  const updated = await repo.updateProperty(ctx.supabase, propertyId, values);
  if (!updated) throw errors.notFound(NOT_FOUND);
  await touched(ctx, propertyId);
}

export async function updateBasics(ctx: UserServiceContext, input: UpdateBasicsInput): Promise<void> {
  const { property_id, ...values } = input;
  await updateOwnProperty(ctx, property_id, values);
}

export async function updateLocation(ctx: UserServiceContext, input: LocationInput): Promise<void> {
  const { property_id, lat, lng, ...address } = input;
  await updateOwnProperty(ctx, property_id, {
    ...address,
    location: lat !== null && lng !== null ? toPointEwkt({ lat, lng }) : null,
  });
}

export async function updatePricing(ctx: UserServiceContext, input: PricingInput): Promise<void> {
  const { property_id, ...values } = input;
  await updateOwnProperty(ctx, property_id, values);
}

// ───────────────────────────── rooms and beds ─────────────────────────────

export async function saveRoom(ctx: UserServiceContext, input: RoomInput): Promise<{ id: string }> {
  const property = await requireOwnProperty(ctx, input.property_id);
  if (property.listing_mode !== "per_bed") {
    throw errors.validation({ formErrors: ["Rooms and beds apply to per-bed listings only."], fieldErrors: {} }, "Rooms and beds apply to per-bed listings only.");
  }
  const { property_id, room_id, ...values } = input;
  if (room_id) {
    const updated = await repo.updateRoom(ctx.supabase, room_id, values);
    if (!updated) throw errors.notFound("Room not found.");
    invalidateListingCache(property.slug);
    return { id: room_id };
  }
  const position = await repo.nextRoomPosition(ctx.supabase, property_id);
  const room = await repo.insertRoom(ctx.supabase, { ...values, property_id, position });
  invalidateListingCache(property.slug);
  return room;
}

async function requireOwnRoom(ctx: UserServiceContext, roomId: string) {
  const room = await repo.fetchRoom(ctx.supabase, roomId);
  if (!room || room.deleted_at) throw errors.notFound("Room not found.");
  const property = await requireOwnProperty(ctx, room.property_id);
  return { room, property };
}

export async function deleteRoom(ctx: UserServiceContext, roomId: string): Promise<void> {
  const { property } = await requireOwnRoom(ctx, roomId);
  const deleted = await repo.deleteRoom(ctx.supabase, roomId);
  if (!deleted) throw errors.notFound("Room not found.");
  invalidateListingCache(property.slug);
}

export async function addBed(ctx: UserServiceContext, input: AddBedInput): Promise<{ id: string }> {
  const { room, property } = await requireOwnRoom(ctx, input.room_id);
  const bed = await repo.insertBed(ctx.supabase, room, input.label);
  invalidateListingCache(property.slug);
  return bed;
}

/** Adds one bed with the next free label ("Bed 3"). The capacity trigger refuses a full room. */
export async function addNextBed(ctx: UserServiceContext, roomId: string): Promise<{ id: string }> {
  const { room, property } = await requireOwnRoom(ctx, roomId);
  const labels = await repo.listBedLabels(ctx.supabase, roomId);
  if (labels.length >= room.capacity) {
    throw errors.validation(
      { formErrors: [`This room already has all ${room.capacity} of its beds.`], fieldErrors: {} },
      `This room already has all ${room.capacity} of its beds. Raise the capacity first.`,
    );
  }
  const bed = await repo.insertBed(ctx.supabase, room, nextBedLabel(labels));
  invalidateListingCache(property.slug);
  return bed;
}

export async function updateBed(ctx: UserServiceContext, input: UpdateBedInput): Promise<void> {
  const { bed_id, ...values } = input;
  const bed = await repo.fetchBed(ctx.supabase, bed_id);
  if (!bed) throw errors.notFound("Bed not found.");
  const property = await requireOwnProperty(ctx, bed.property_id);
  const updated = await repo.updateBed(ctx.supabase, bed_id, {
    ...values,
    // A date only describes when an available bed frees up.
    available_from: values.status === "available" ? values.available_from : null,
  });
  if (!updated) throw errors.notFound("Bed not found.");
  invalidateListingCache(property.slug);
}

export async function deleteBed(ctx: UserServiceContext, bedId: string): Promise<void> {
  const bed = await repo.fetchBed(ctx.supabase, bedId);
  if (!bed) throw errors.notFound("Bed not found.");
  const property = await requireOwnProperty(ctx, bed.property_id);
  const deleted = await repo.deleteBed(ctx.supabase, bedId);
  if (!deleted) throw errors.notFound("Bed not found.");
  invalidateListingCache(property.slug);
}

// ───────────────────────────── availability, amenities, rules, charges ─────────────────────────────

export async function updateAvailability(ctx: UserServiceContext, input: AvailabilityInput): Promise<void> {
  const property = await requireOwnProperty(ctx, input.property_id);
  if (property.listing_mode !== "entire_unit") {
    throw errors.validation(
      { formErrors: ["Per-bed listings take their availability from the beds."], fieldErrors: {} },
      "Per-bed listings take their availability from the beds. Update the bed statuses instead.",
    );
  }
  const { property_id, ...values } = input;
  const updated = await repo.updateAvailability(ctx.supabase, property_id, values);
  if (!updated) throw errors.notFound(NOT_FOUND);
  invalidateListingCache(property.slug);
}

export async function setAmenities(ctx: UserServiceContext, input: AmenitiesInput): Promise<void> {
  const property = await requireOwnProperty(ctx, input.property_id);
  const known = new Set((await repo.listAmenities(ctx.supabase)).map((amenity) => amenity.code));
  const unknown = input.amenity_codes.filter((code) => !known.has(code));
  if (unknown.length) {
    throw errors.validation({ formErrors: [], fieldErrors: { amenity_codes: ["Some amenities are not recognised."] } });
  }
  await repo.replaceAmenities(ctx.supabase, input.property_id, input.amenity_codes);
  invalidateListingCache(property.slug);
}

export async function saveRules(ctx: UserServiceContext, input: RulesInput): Promise<void> {
  const property = await requireOwnProperty(ctx, input.property_id);
  await repo.replaceRules(ctx.supabase, input.property_id, rulesToRows(input));
  invalidateListingCache(property.slug);
}

export async function saveCharges(ctx: UserServiceContext, input: ChargesInput): Promise<void> {
  const property = await requireOwnProperty(ctx, input.property_id);
  await repo.replaceCharges(
    ctx.supabase,
    input.property_id,
    input.charges.map((charge, position) => ({ ...charge, property_id: input.property_id, position })),
  );
  invalidateListingCache(property.slug);
}

// ───────────────────────────── media ─────────────────────────────

/**
 * Records a photo the browser already uploaded to `property-media/<property_id>/<uuid>.webp`
 * (the bucket policy allowed that upload only for this property's owner). The first photo
 * becomes the cover.
 */
export async function registerMedia(ctx: UserServiceContext, input: RegisterMediaInput): Promise<OwnerMedia> {
  const property = await requireOwnProperty(ctx, input.property_id);
  const stats = await repo.mediaStats(ctx.supabase, input.property_id);
  if (stats.count >= PROPERTY_MEDIA_MAX_COUNT) {
    throw errors.validation({ formErrors: [`A listing can have up to ${PROPERTY_MEDIA_MAX_COUNT} photos.`], fieldErrors: {} });
  }
  const row = await repo.insertMedia(ctx.supabase, {
    property_id: input.property_id,
    storage_path: input.storage_path,
    kind: "image",
    alt_text: input.alt_text ?? null,
    width: input.width,
    height: input.height,
    size_bytes: input.size_bytes,
    position: Math.min(32_000, stats.maxPosition + 1),
    is_cover: !stats.hasCover,
  });
  invalidateListingCache(property.slug);
  return { ...row, url: propertyMediaUrl(row.storage_path) };
}

async function requireOwnMedia(ctx: UserServiceContext, mediaId: string) {
  const media = await repo.fetchMedia(ctx.supabase, mediaId);
  if (!media) throw errors.notFound("Photo not found.");
  const property = await requireOwnProperty(ctx, media.property_id);
  return { media, property };
}

export async function setCoverMedia(ctx: UserServiceContext, mediaId: string): Promise<void> {
  const { property } = await requireOwnMedia(ctx, mediaId);
  if (!(await repo.setCover(ctx.supabase, mediaId))) throw errors.notFound("Photo not found.");
  invalidateListingCache(property.slug);
}

export async function reorderMedia(ctx: UserServiceContext, input: ReorderMediaInput): Promise<void> {
  const property = await requireOwnProperty(ctx, input.property_id);
  const { media } = await repo.fetchPropertyChildren(ctx.supabase, property.id);
  const own = new Set(media.map((item) => item.id));
  if (input.media_ids.length !== own.size || input.media_ids.some((id) => !own.has(id))) {
    throw errors.conflict("The photos changed in the meantime. Reload and try again.");
  }
  for (const [position, id] of input.media_ids.entries()) {
    await repo.setMediaPosition(ctx.supabase, property.id, id, position);
  }
  invalidateListingCache(property.slug);
}

export async function deleteMedia(ctx: UserServiceContext, mediaId: string): Promise<void> {
  const { media, property } = await requireOwnMedia(ctx, mediaId);
  if (!(await repo.deleteMediaRow(ctx.supabase, mediaId))) throw errors.notFound("Photo not found.");
  await repo.removeStorageObjects(ctx.supabase, [media.storage_path]);
  if (media.is_cover) {
    const next = await repo.firstMediaId(ctx.supabase, media.property_id);
    if (next) await repo.setCover(ctx.supabase, next);
  }
  invalidateListingCache(property.slug);
}

/** Removes an object the browser uploaded when recording it failed (keeps the bucket clean). */
export async function discardUpload(ctx: UserServiceContext, input: { property_id: string; storage_path: string }): Promise<void> {
  await requireOwnProperty(ctx, input.property_id);
  await repo.removeStorageObjects(ctx.supabase, [input.storage_path]);
}

// ───────────────────────────── lifecycle ─────────────────────────────

/**
 * Pre-checks completeness (listingGaps mirrors the SQL rules) so the owner gets the checklist,
 * then lets submit_property_for_review() re-check and move the listing. See completeness.ts for
 * why the SQL function's own "missing" list cannot be relied on yet.
 */
export async function submitForReview(ctx: UserServiceContext, propertyId: string): Promise<SubmitResult> {
  const detail = await getPropertyDetail(ctx, propertyId);
  if (detail.status === "draft" || detail.status === "rejected") {
    const gaps = listingGaps(detail);
    if (gaps.length) return { submitted: false, missing: gaps };
  }
  const missing = await repo.submitForReview(ctx.supabase, propertyId);
  invalidateListingCache(detail.slug);
  return { submitted: missing.length === 0, missing };
}

export async function setListingStatus(ctx: UserServiceContext, input: SetListingStatusInput): Promise<void> {
  await repo.setListingStatus(ctx.supabase, input);
  await touched(ctx, input.property_id);
}

export async function confirmListing(ctx: UserServiceContext, propertyId: string): Promise<void> {
  await repo.confirmListing(ctx.supabase, propertyId);
  await touched(ctx, propertyId);
}

/** Opens (or reopens) the chat with the person who enquired; returns the conversation id. */
export async function startInquiryConversation(ctx: UserServiceContext, inquiryId: string): Promise<{ conversation_id: string }> {
  return { conversation_id: await repo.startInquiryConversation(ctx.supabase, inquiryId) };
}

// ───────────────────────────── enquiries, dashboard, reviews, verification ─────────────────────────────

export async function listInquiries(ctx: UserServiceContext, limit = 100): Promise<OwnerInquiry[]> {
  const rows = await repo.listInquiries(ctx.supabase, ctx.user.id, limit);
  const names = await repo.fetchUserCards(ctx.supabase, rows.map((row) => row.seeker_id));
  return rows.map((row) => ({
    id: row.id,
    property_id: row.property_id,
    property_title: row.properties.title,
    seeker_name: names.get(row.seeker_id) ?? "Former member",
    message: row.message,
    move_in_date: row.move_in_date,
    occupants: row.occupants,
    status: row.status,
    conversation_id: row.conversation_id,
    created_at: row.created_at,
  }));
}

const PERFORMANCE_DAYS = 30;

export async function getDashboard(ctx: UserServiceContext): Promise<OwnerDashboard> {
  const [account, properties, newInquiries, recent] = await Promise.all([
    repo.fetchOwnerAccount(ctx.supabase, ctx.user.id),
    repo.listOwnerProperties(ctx.supabase, ctx.user.id),
    repo.countNewInquiries(ctx.supabase, ctx.user.id),
    listInquiries(ctx, 5),
  ]);
  if (!account) throw errors.notFound("Owner profile not found.");

  const counts: Record<ListingStatus, number> = { draft: 0, pending_review: 0, published: 0, paused: 0, rejected: 0, archived: 0 };
  for (const property of properties) counts[property.status] += 1;

  const stats = await repo.listStats(
    ctx.supabase,
    properties.map((property) => property.id),
    istDay(PERFORMANCE_DAYS - 1),
  );
  const totals = new Map<string, { views: number; saves: number; inquiries: number; contact_reveals: number }>();
  for (const row of stats) {
    const current = totals.get(row.property_id) ?? { views: 0, saves: 0, inquiries: 0, contact_reveals: 0 };
    current.views += row.views;
    current.saves += row.saves;
    current.inquiries += row.inquiries;
    current.contact_reveals += row.contact_reveals;
    totals.set(row.property_id, current);
  }
  const performance = properties
    .filter((property) => totals.has(property.id))
    .map((property) => ({ property_id: property.id, title: property.title, ...totals.get(property.id)! }))
    .sort((a, b) => b.views - a.views);

  return { account, counts, new_inquiries: newInquiries, recent_inquiries: recent, performance, performance_days: PERFORMANCE_DAYS };
}

export async function listReviews(ctx: UserServiceContext): Promise<OwnerReview[]> {
  const rows = await repo.listReviews(ctx.supabase, ctx.user.id);
  const names = await repo.fetchUserCards(ctx.supabase, rows.map((row) => row.author_id));
  return rows.map((row) => {
    const reply = Array.isArray(row.owner_replies) ? row.owner_replies[0] : row.owner_replies;
    return {
      id: row.id,
      property_id: row.property_id,
      property_title: row.properties.title,
      author_name: names.get(row.author_id) ?? "Former member",
      rating: row.rating,
      title: row.title,
      body: row.body,
      created_at: row.created_at,
      reply: reply ? { body: reply.body, updated_at: reply.updated_at } : null,
    };
  });
}

export async function replyToReview(ctx: UserServiceContext, input: ReplyToReviewInput): Promise<void> {
  await repo.upsertReply(ctx.supabase, ctx.user.id, input.review_id, input.body);
}

export async function listVerificationRecords(ctx: UserServiceContext): Promise<OwnerVerificationRecord[]> {
  return repo.listVerificationRecords(ctx.supabase, ctx.user.id);
}
