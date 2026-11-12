import { z } from "zod";

import type { Database } from "@/lib/database.types";

/** Admin dashboard contracts (isomorphic). Field names are database columns (snake_case). */

type Enums = Database["public"]["Enums"];
export type ListingStatus = Enums["listing_status"];

/** Approve, or reject with a reason the owner sees (admin_review_property needs >= 5 characters). */
export const reviewDecisionSchema = z
  .object({
    property_id: z.uuid("That listing id is not valid."),
    approve: z.boolean(),
    reason: z
      .string()
      .trim()
      .max(500, "Keep the reason under 500 characters.")
      .optional()
      .transform((value) => (value ? value : null)),
  })
  .superRefine((value, ctx) => {
    if (!value.approve && (value.reason === null || value.reason.length < 5)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "Tell the owner what to change (at least 5 characters)." });
    }
  })
  .transform((value) => ({ ...value, reason: value.approve ? null : value.reason }));
export type ReviewDecisionValues = z.input<typeof reviewDecisionSchema>;
export type ReviewDecisionInput = z.output<typeof reviewDecisionSchema>;

export const CONTACT_STATUSES = ["new", "in_progress", "resolved", "spam"] as const;
export type ContactStatus = (typeof CONTACT_STATUSES)[number];
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  new: "New",
  in_progress: "In progress",
  resolved: "Resolved",
  spam: "Spam",
};

export const contactUpdateSchema = z.object({
  id: z.uuid(),
  status: z.enum(CONTACT_STATUSES),
  staff_note: z
    .string()
    .trim()
    .max(1000, "Keep the note under 1,000 characters.")
    .transform((value) => (value === "" ? null : value)),
});
export type ContactUpdateValues = z.input<typeof contactUpdateSchema>;
export type ContactUpdateInput = z.output<typeof contactUpdateSchema>;

export const REVIEW_QUEUE_STATUSES = ["pending_review", "published", "paused", "rejected", "draft", "archived"] as const satisfies readonly ListingStatus[];

/** `?status=` of the listings page; unknown values fall back to the review queue. */
export function parseQueueStatus(value: unknown): ListingStatus {
  return typeof value === "string" && (REVIEW_QUEUE_STATUSES as readonly string[]).includes(value) ? (value as ListingStatus) : "pending_review";
}

/** `?page=` (1-based, clamped). */
export function parsePage(value: unknown): number {
  const n = Number.parseInt(typeof value === "string" ? value : "", 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 10_000) : 1;
}

export const ADMIN_PAGE_SIZE = 20;

// ───────────────────────────── DTOs ─────────────────────────────

export type AdminStats = {
  users: number;
  owners: number;
  listings: Record<ListingStatus, number>;
  contact_messages_new: number;
  contact_messages_total: number;
  verifications_pending: number;
};

export type AdminListingRow = {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  property_type: Enums["property_type"];
  listing_mode: Enums["listing_mode"];
  locality: string | null;
  city: string | null;
  owner_name: string;
  submitted_at: string | null;
  updated_at: string;
  rejection_reason: string | null;
  cover_url: string | null;
};

export type AdminListingDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: ListingStatus;
  rejection_reason: string | null;
  property_type: Enums["property_type"];
  listing_mode: Enums["listing_mode"];
  tenant_gender: Enums["tenant_gender"];
  furnishing: Enums["furnishing"] | null;
  address: string;
  location: { lat: number; lng: number } | null;
  monthly_rent: number | null;
  security_deposit: number | null;
  maintenance_monthly: number | null;
  electricity_billing: Enums["utility_billing"] | null;
  electricity_monthly_estimate: number | null;
  water_billing: Enums["utility_billing"] | null;
  water_monthly_estimate: number | null;
  food_available: boolean;
  food_included: boolean;
  food_monthly_charge: number | null;
  min_rent: number | null;
  max_rent: number | null;
  total_beds: number;
  available_beds: number;
  submitted_at: string | null;
  published_at: string | null;
  created_at: string;
  owner: {
    user_id: string;
    display_name: string;
    email: string | null;
    owner_type: Enums["owner_type"];
    business_name: string | null;
    contact_phone: string | null;
    verification_status: Enums["verification_status"];
    member_since: string;
  } | null;
  rooms: { id: string; name: string; capacity: number; rent_per_bed: number | null; beds: { label: string; status: Enums["bed_status"] }[] }[];
  photos: { id: string; url: string; is_cover: boolean }[];
  amenities: string[];
  rules: { rule_code: string; allowed: boolean | null; value: string | null; note: string | null }[];
  charges: { label: string; amount: number; frequency: Enums["charge_frequency"]; is_mandatory: boolean }[];
  availability: { status: Enums["availability_status"]; available_from: string | null } | null;
};

export type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string;
  status: Enums["account_status"];
  roles: Enums["user_role"][];
  onboarded: boolean;
  created_at: string;
};

export type AdminOwnerRow = {
  user_id: string;
  display_name: string;
  email: string | null;
  owner_type: Enums["owner_type"];
  business_name: string | null;
  contact_phone: string | null;
  verification_status: Enums["verification_status"];
  created_at: string;
};

export type AdminContactMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  status: ContactStatus;
  staff_note: string | null;
  created_at: string;
  handled_at: string | null;
};

export type AdminAuditRow = {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: unknown;
  created_at: string;
};

export type AdminVerificationRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  submitter_name: string;
  kind: Enums["verification_kind"];
  status: Enums["verification_status"];
  created_at: string;
};

export type AdminReviewRow = {
  id: string;
  property_title: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: Enums["review_status"];
  created_at: string;
};

/** One row of the read-only moderation queues (reports, message reports, appeals). */
export type AdminModerationRow = {
  id: string;
  title: string;
  people: string;
  details: string | null;
  status: string;
  created_at: string;
};

export type AdminSettingRow = { key: string; value: unknown; description: string | null; updated_at: string };

export type Paged<T> = { rows: T[]; total: number; page: number; page_size: number };

// ───────────────────────────── analytics (admin_dashboard_stats) ─────────────────────────────

export const BOOKING_STATUSES = ["requested", "accepted", "confirmed", "declined", "expired", "cancelled"] as const satisfies readonly Enums["booking_status"][];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const count = z.number().int().nonnegative().catch(0);

/** Parses the jsonb from admin_dashboard_stats(); unknown status keys are ignored, missing ones are 0. */
export const adminAnalyticsSchema = z.object({
  generated_at: z.string(),
  users_total: count,
  users_new_today: count,
  users_new_7d: count,
  users_new_30d: count,
  signups_by_day: z.array(z.object({ day: z.string(), count })).catch([]),
  owners: count,
  listings_by_status: z.record(z.string(), count).catch({}),
  bookings_by_status: z.record(z.string(), count).catch({}),
  roommate_profiles: count,
  roommate_profiles_active: count,
  matches: count,
  messages_7d: count,
  contact_messages_new: count,
  ai_calls_7d: count,
});

export type AdminAnalytics = Omit<z.infer<typeof adminAnalyticsSchema>, "listings_by_status" | "bookings_by_status"> & {
  listings_by_status: Record<ListingStatus, number>;
  bookings_by_status: Record<BookingStatus, number>;
};

const LISTING_STATUS_KEYS = ["draft", "pending_review", "published", "paused", "rejected", "archived"] as const satisfies readonly ListingStatus[];

function pick<K extends string>(keys: readonly K[], source: Record<string, number>): Record<K, number> {
  const out = {} as Record<K, number>;
  for (const key of keys) out[key] = source[key] ?? 0;
  return out;
}

export function parseAdminAnalytics(raw: unknown): AdminAnalytics {
  const parsed = adminAnalyticsSchema.parse(raw);
  return {
    ...parsed,
    signups_by_day: parsed.signups_by_day.map((point) => ({ day: point.day.slice(0, 10), count: point.count })),
    listings_by_status: pick(LISTING_STATUS_KEYS, parsed.listings_by_status),
    bookings_by_status: pick(BOOKING_STATUSES, parsed.bookings_by_status),
  };
}
