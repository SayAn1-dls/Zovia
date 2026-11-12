import { z } from "zod";

import type { Database } from "@/lib/database.types";

/**
 * Property marketplace contracts (isomorphic). Field names are database columns (snake_case).
 * Imported by the owner portal and the assistant for labels and types; never import the
 * repository from another module.
 */

type Enums = Database["public"]["Enums"];
export type PropertyType = Enums["property_type"];
export type ListingMode = Enums["listing_mode"];
export type TenantGender = Enums["tenant_gender"];
export type Furnishing = Enums["furnishing"];
export type AvailabilityStatus = Enums["availability_status"];
export type BedStatus = Enums["bed_status"];
export type RoomType = Enums["room_type"];
export type UtilityBilling = Enums["utility_billing"];
export type ChargeFrequency = Enums["charge_frequency"];
export type OwnerType = Enums["owner_type"];
export type VerificationStatus = Enums["verification_status"];
export type InquiryStatus = Enums["inquiry_status"];

// ───────────────────────────── labels ─────────────────────────────

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  pg: "PG",
  boys_pg: "Boys PG",
  girls_pg: "Girls PG",
  hostel: "Hostel",
  co_living: "Co-living",
  private_room: "Private room",
  shared_room: "Shared room",
  studio: "Studio",
  one_bhk: "1 BHK",
  two_bhk: "2 BHK",
  three_bhk: "3 BHK",
  independent_house: "Independent house",
};
export const PROPERTY_TYPES = Object.keys(PROPERTY_TYPE_LABELS) as PropertyType[];

export const FURNISHING_LABELS: Record<Furnishing, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  fully_furnished: "Fully furnished",
};
export const FURNISHINGS = Object.keys(FURNISHING_LABELS) as Furnishing[];

export const TENANT_GENDER_LABELS: Record<TenantGender, string> = {
  any: "Anyone",
  male: "Men only",
  female: "Women only",
};

/** The search "who's it for" filter: listings for anyone plus listings for this gender. */
export const GENDER_FILTER_LABELS = { male: "Men", female: "Women" } as const;
export type GenderFilter = keyof typeof GENDER_FILTER_LABELS;

export const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  individual: "Individual owner",
  pg_operator: "PG operator",
  agent: "Agent",
  company: "Company",
};

export const ROOM_TYPE_LABELS: Record<RoomType, string> = { private: "Private room", shared: "Shared room" };

export const SORTS = ["relevance", "price_asc", "price_desc", "newest", "distance"] as const;
export type SearchSort = (typeof SORTS)[number];
export const SORT_LABELS: Record<SearchSort, string> = {
  relevance: "Best match",
  price_asc: "Price: low to high",
  price_desc: "Price: high to low",
  newest: "Newest",
  distance: "Distance",
};

/**
 * House-rule codes the UI knows (property_rules.rule_code; "the UI owns the catalogue").
 * Unknown codes are shown with a humanised label.
 */
export const HOUSE_RULE_LABELS: Record<string, string> = {
  smoking: "Smoking",
  drinking: "Alcohol",
  pets: "Pets",
  visitors: "Visitors",
  overnight_guests: "Overnight guests",
  non_veg_food: "Non-veg food",
  couples: "Couples",
  loud_music: "Loud music",
  gate_closing_time: "Gate closes at",
};

export function humaniseCode(code: string): string {
  const text = code.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : code;
}

/** Days a listing counts as "recently confirmed" (spec 6.2: platform_settings.listing_fresh_days, default 30). */
export const LISTING_FRESH_DAYS = 30;

/** Results per search page. */
export const SEARCH_PAGE_SIZE = 18;

// ───────────────────────────── search filters ─────────────────────────────

const AMENITY_CODE = /^[a-z][a-z0-9_]{1,39}$/;

/** A single query value: the last one when a key repeats. */
function single(value: unknown): unknown {
  return Array.isArray(value) ? value[value.length - 1] : value;
}

/** Repeated keys (`type=pg&type=hostel`) or a comma list (`type=pg,hostel`) -> string[]. */
function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return values
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const text = (max: number) =>
  z.preprocess(
    (value) => {
      const v = single(value);
      if (typeof v !== "string") return undefined;
      const trimmed = v.trim().replace(/\s+/g, " ");
      return trimmed === "" ? undefined : trimmed.slice(0, max);
    },
    z.string().optional(),
  );

const integer = (min: number, max: number) =>
  z.preprocess((value) => {
    const v = single(value);
    if (v === undefined || v === null || v === "") return undefined;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s₹]/g, ""));
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }, z.number().int().min(min).max(max).optional().catch(undefined));

const decimal = (min: number, max: number) =>
  z.preprocess((value) => {
    const v = single(value);
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().min(min).max(max).optional().catch(undefined));

const flag = z.preprocess((value) => {
  const v = single(value);
  if (typeof v === "boolean") return v;
  return typeof v === "string" && ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}, z.boolean());

function enumValue<T extends string>(values: readonly T[]) {
  return z.preprocess((value) => {
    const v = single(value);
    return typeof v === "string" && (values as readonly string[]).includes(v) ? v : undefined;
  }, z.enum(values as [T, ...T[]]).optional());
}

function enumList<T extends string>(values: readonly T[], max: number) {
  return z.preprocess(
    (value) => [...new Set(list(value).filter((v) => (values as readonly string[]).includes(v)))].sort().slice(0, max),
    z.array(z.enum(values as [T, ...T[]])),
  );
}

/**
 * Search filters from the URL / API query string. Deliberately lenient: anything unknown or out
 * of range is dropped instead of failing the page (a hand-edited URL still shows results), and
 * the output is normalised (sorted unique lists, swapped budgets, lat/lng only as a pair) so it
 * can be used as a cache key.
 */
export const searchFiltersSchema = z
  .object({
    city: text(80),
    q: text(100),
    type: enumList(PROPERTY_TYPES, PROPERTY_TYPES.length),
    budget_min: integer(0, 10_000_000),
    budget_max: integer(0, 10_000_000),
    gender: enumValue(["male", "female"] as const),
    food: flag,
    amenities: z.preprocess(
      (value) => [...new Set(list(value).filter((v) => AMENITY_CODE.test(v)))].sort().slice(0, 12),
      z.array(z.string()),
    ),
    furnishing: enumValue(FURNISHINGS),
    available_only: flag,
    sort: z.preprocess((value) => single(value), z.enum(SORTS).catch("relevance")).default("relevance"),
    page: z.preprocess((value) => single(value), z.coerce.number().int().min(1).max(500).catch(1)).default(1),
    lat: decimal(6, 38),
    lng: decimal(68, 98),
  })
  .transform((value) => {
    let { budget_min, budget_max } = value;
    if (budget_min !== undefined && budget_max !== undefined && budget_min > budget_max) {
      [budget_min, budget_max] = [budget_max, budget_min];
    }
    const hasPoint = value.lat !== undefined && value.lng !== undefined;
    return {
      ...value,
      budget_min,
      budget_max,
      lat: hasPoint ? Math.round(value.lat! * 1e5) / 1e5 : undefined,
      lng: hasPoint ? Math.round(value.lng! * 1e5) / 1e5 : undefined,
    };
  });

export type SearchFilters = z.output<typeof searchFiltersSchema>;

/** Parses any query object (Next.js searchParams, API query) into normalised filters. Never throws. */
export function parseSearchFilters(input: Record<string, unknown> | null | undefined): SearchFilters {
  const result = searchFiltersSchema.safeParse(input ?? {});
  // Every field has a fallback, so this only fails on a non-object input.
  return result.success ? result.data : searchFiltersSchema.parse({});
}

/** Filters -> query params for links (pagination, "clear"). Defaults are left out. */
export function searchFiltersToQuery(
  filters: Partial<SearchFilters>,
): Record<string, string | number | readonly string[] | undefined> {
  return {
    city: filters.city,
    q: filters.q,
    type: filters.type && filters.type.length > 0 ? filters.type : undefined,
    budget_min: filters.budget_min,
    budget_max: filters.budget_max,
    gender: filters.gender,
    food: filters.food ? "true" : undefined,
    amenities: filters.amenities && filters.amenities.length > 0 ? filters.amenities : undefined,
    furnishing: filters.furnishing,
    available_only: filters.available_only ? "true" : undefined,
    sort: filters.sort && filters.sort !== "relevance" ? filters.sort : undefined,
    page: filters.page && filters.page > 1 ? filters.page : undefined,
    lat: filters.lat,
    lng: filters.lng,
  };
}

/** How many refinements are active (for the "Filters (3)" button). City, text and sort are not counted. */
export function countActiveFilters(filters: SearchFilters): number {
  return (
    filters.type.length +
    (filters.budget_min !== undefined || filters.budget_max !== undefined ? 1 : 0) +
    (filters.gender ? 1 : 0) +
    (filters.food ? 1 : 0) +
    filters.amenities.length +
    (filters.furnishing ? 1 : 0) +
    (filters.available_only ? 1 : 0)
  );
}

// ───────────────────────────── search results ─────────────────────────────

export type SearchResultItem = {
  id: string;
  slug: string;
  title: string;
  property_type: PropertyType;
  listing_mode: ListingMode;
  tenant_gender: TenantGender;
  furnishing: Furnishing | null;
  locality: string | null;
  city: string | null;
  /** Lowest monthly rent (per_bed: cheapest bed; entire_unit: the unit's rent). */
  price_from: number | null;
  available_beds: number;
  total_beds: number;
  amenity_codes: string[];
  food_available: boolean;
  cover_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  recently_confirmed: boolean;
  lat: number | null;
  lng: number | null;
  /** Straight-line metres from the search point, when one was given. */
  distance_m: number | null;
  /** The property's own availability statement (shown for entire_unit listings). */
  availability_status: AvailabilityStatus | null;
  available_from: string | null;
};

export type CityOption = { slug: string; name: string; state: string; lat: number; lng: number };
export type AmenityOption = { code: string; name: string; category: string; icon: string };

export type SearchResponse = {
  items: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  /** The city the filter resolved to, when it matched the reference list. */
  city: CityOption | null;
  /** The point distances are measured from (near me, or the city centre for distance sort). */
  origin: { lat: number; lng: number } | null;
};

// ───────────────────────────── property detail ─────────────────────────────

export type PropertyPhoto = {
  id: string;
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
  room_id: string | null;
};

export type PropertyBed = {
  id: string;
  label: string;
  status: BedStatus;
  available_from: string | null;
  rent_override: number | null;
};

export type PropertyRoom = {
  id: string;
  name: string;
  room_type: RoomType;
  capacity: number;
  rent_per_bed: number | null;
  security_deposit: number | null;
  has_attached_bathroom: boolean;
  has_ac: boolean;
  has_balcony: boolean;
  floor: number | null;
  area_sqft: number | null;
  description: string | null;
  beds: PropertyBed[];
};

export type PropertyCharge = {
  id: string;
  label: string;
  amount: number;
  frequency: ChargeFrequency;
  is_mandatory: boolean;
};

export type PropertyRule = { rule_code: string; allowed: boolean | null; value: string | null; note: string | null };

export type OwnerCard = {
  user_id: string;
  display_name: string;
  owner_type: OwnerType;
  verification_status: VerificationStatus;
  verified_at: string | null;
  member_since: string;
};

export type PropertyReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  author_name: string;
  owner_reply: { body: string; created_at: string } | null;
};

export type TrustSignals = {
  /** property_owners.verification_status = verified (identity documents reviewed by staff). */
  owner_verified: boolean;
  /** property_verifications kind authorisation, status verified and not expired. */
  authorisation_verified: boolean;
  /** last_confirmed_at within LISTING_FRESH_DAYS. */
  recently_confirmed: boolean;
  last_confirmed_at: string | null;
};

export type PropertyDetail = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  property_type: PropertyType;
  listing_mode: ListingMode;
  tenant_gender: TenantGender;
  furnishing: Furnishing | null;
  address_line: string | null;
  locality: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  landmark: string | null;
  location: { lat: number; lng: number } | null;
  // pricing
  monthly_rent: number | null;
  security_deposit: number | null;
  maintenance_monthly: number | null;
  electricity_billing: UtilityBilling | null;
  electricity_monthly_estimate: number | null;
  water_billing: UtilityBilling | null;
  water_monthly_estimate: number | null;
  food_available: boolean;
  food_included: boolean;
  food_monthly_charge: number | null;
  meals: { breakfast: boolean; lunch: boolean; dinner: boolean };
  min_rent: number | null;
  max_rent: number | null;
  total_beds: number;
  available_beds: number;
  rating_avg: number | null;
  rating_count: number;
  published_at: string | null;
  photos: PropertyPhoto[];
  rooms: PropertyRoom[];
  amenities: AmenityOption[];
  rules: PropertyRule[];
  charges: PropertyCharge[];
  availability: {
    status: AvailabilityStatus;
    available_from: string | null;
    min_stay_months: number | null;
    notice_period_days: number | null;
  } | null;
  owner: OwnerCard | null;
  trust: TrustSignals;
  reviews: PropertyReview[];
  /** India date (YYYY-MM-DD) the data was read on; "available from" dates are compared with it. */
  as_of: string;
};

// ───────────────────────────── seeker actions ─────────────────────────────

export const propertyRefSchema = z.object({
  id: z.string().trim().min(1).max(160),
});

export const propertyIdParamsSchema = z.object({ id: z.uuid({ error: "That listing id is not valid." }) });

export const saveBodySchema = z.object({ property_id: z.uuid({ error: "That listing id is not valid." }) });
export type SaveBody = z.output<typeof saveBodySchema>;

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const inquirySchema = z.object({
  message: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters.")
    .max(1000, "Keep your message under 1,000 characters."),
  move_in_date: z
    .union([z.literal(""), z.null(), z.string().regex(isoDate, "Pick a valid date.")])
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || (value >= "2020-01-01" && value <= "2100-01-01"), "Pick a valid date."),
  occupants: z.coerce
    .number({ error: "Enter how many people will move in." })
    .int("Enter a whole number.")
    .min(1, "At least 1 person.")
    .max(12, "At most 12 people."),
  room_id: z
    .union([z.literal(""), z.null(), z.uuid()])
    .optional()
    .transform((value) => (value ? value : null)),
});
export type InquiryFormValues = z.input<typeof inquirySchema>;
export type InquiryInput = z.output<typeof inquirySchema>;

export type OwnerContact = { display_name: string; contact_phone: string | null; whatsapp_number: string | null };

export type SavedPropertyItem = {
  property_id: string;
  saved_at: string;
  /** null when the listing is no longer public (paused, archived, removed). */
  property: Pick<
    SearchResultItem,
    | "id"
    | "slug"
    | "title"
    | "property_type"
    | "listing_mode"
    | "locality"
    | "city"
    | "price_from"
    | "available_beds"
    | "total_beds"
    | "cover_url"
    | "rating_avg"
    | "rating_count"
  > | null;
};

export type MyInquiry = {
  id: string;
  status: InquiryStatus;
  message: string;
  move_in_date: string | null;
  occupants: number;
  created_at: string;
  owner_responded_at: string | null;
  property: { id: string; slug: string; title: string; locality: string | null; city: string | null } | null;
};

/** Cache tags for public property data; the owner portal / admin may call revalidateTag with these. */
export const PROPERTY_CACHE_TAGS = {
  all: "properties",
  detail: (slug: string) => `property:${slug}`,
  reference: "property-reference-data",
} as const;
