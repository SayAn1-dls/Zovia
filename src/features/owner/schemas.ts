import { z } from "zod";

import type { Database } from "@/lib/database.types";

/**
 * Owner portal contracts (isomorphic). Field names are the database columns (snake_case).
 * These schemas are the first, friendly check; the database (column grants, RLS, CHECK
 * constraints, triggers and the lifecycle functions) is the enforcer.
 */

type Enums = Database["public"]["Enums"];

export type OwnerType = Enums["owner_type"];
export type PropertyType = Enums["property_type"];
export type ListingMode = Enums["listing_mode"];
export type TenantGender = Enums["tenant_gender"];
export type Furnishing = Enums["furnishing"];
export type ListingStatus = Enums["listing_status"];
export type BedStatus = Enums["bed_status"];
export type RoomType = Enums["room_type"];
export type UtilityBilling = Enums["utility_billing"];
export type AvailabilityStatus = Enums["availability_status"];
export type ChargeFrequency = Enums["charge_frequency"];
export type InquiryStatus = Enums["inquiry_status"];
export type VerificationStatus = Enums["verification_status"];

// ───────────────────────────── enum catalogues + labels ─────────────────────────────

export const OWNER_TYPES = ["individual", "pg_operator", "agent", "company"] as const satisfies readonly OwnerType[];
export const OWNER_TYPE_LABELS: Record<OwnerType, string> = {
  individual: "Individual owner",
  pg_operator: "PG / hostel operator",
  agent: "Agent",
  company: "Company",
};

export const PROPERTY_TYPES = [
  "pg",
  "boys_pg",
  "girls_pg",
  "hostel",
  "co_living",
  "private_room",
  "shared_room",
  "studio",
  "one_bhk",
  "two_bhk",
  "three_bhk",
  "independent_house",
] as const satisfies readonly PropertyType[];
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

export const LISTING_MODES = ["per_bed", "entire_unit"] as const satisfies readonly ListingMode[];
export const LISTING_MODE_LABELS: Record<ListingMode, { title: string; description: string }> = {
  per_bed: { title: "Rooms and beds", description: "PG, hostel or co-living: you let individual beds." },
  entire_unit: { title: "Entire unit", description: "A flat, studio or house let as one unit." },
};

export const TENANT_GENDERS = ["any", "male", "female"] as const satisfies readonly TenantGender[];
export const TENANT_GENDER_LABELS: Record<TenantGender, string> = {
  any: "Anyone",
  male: "Men only",
  female: "Women only",
};

export const FURNISHINGS = ["unfurnished", "semi_furnished", "fully_furnished"] as const satisfies readonly Furnishing[];
export const FURNISHING_LABELS: Record<Furnishing, string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  fully_furnished: "Fully furnished",
};

export const UTILITY_BILLINGS = ["included", "fixed", "metered"] as const satisfies readonly UtilityBilling[];
export const UTILITY_BILLING_LABELS: Record<UtilityBilling, string> = {
  included: "Included in rent",
  fixed: "Fixed monthly charge",
  metered: "Metered (as used)",
};

export const ROOM_TYPES = ["shared", "private"] as const satisfies readonly RoomType[];
export const ROOM_TYPE_LABELS: Record<RoomType, string> = { shared: "Shared", private: "Private" };

export const BED_STATUSES = ["available", "reserved", "occupied", "blocked"] as const satisfies readonly BedStatus[];
export const BED_STATUS_LABELS: Record<BedStatus, string> = {
  available: "Available",
  reserved: "Reserved",
  occupied: "Occupied",
  blocked: "Blocked",
};

export const AVAILABILITY_STATUSES = [
  "available",
  "limited",
  "fully_occupied",
  "coming_soon",
  "unavailable",
] as const satisfies readonly AvailabilityStatus[];
export const AVAILABILITY_STATUS_LABELS: Record<AvailabilityStatus, string> = {
  available: "Available",
  limited: "Filling fast",
  fully_occupied: "Fully occupied",
  coming_soon: "Coming soon",
  unavailable: "Not available",
};

export const CHARGE_FREQUENCIES = ["monthly", "one_time", "yearly"] as const satisfies readonly ChargeFrequency[];
export const CHARGE_FREQUENCY_LABELS: Record<ChargeFrequency, string> = {
  monthly: "Monthly",
  one_time: "One-time",
  yearly: "Yearly",
};

/**
 * House-rule catalogue (the UI owns the codes, see the comment on public.property_rules).
 * Yes/no rules store `allowed`; the gate time stores `value` ("22:30").
 */
export const YES_NO_RULES = [
  { code: "smoking", label: "Smoking" },
  { code: "drinking", label: "Alcohol" },
  { code: "pets", label: "Pets" },
  { code: "visitors", label: "Visitors" },
  { code: "overnight_guests", label: "Overnight guests" },
  { code: "non_veg_food", label: "Non-veg food" },
  { code: "couples", label: "Couples" },
  { code: "loud_music", label: "Loud music" },
] as const;
export const GATE_TIME_RULE = "gate_closing_time";
export const NOTES_RULE = "other_rules";
export type YesNoRuleCode = (typeof YES_NO_RULES)[number]["code"];
export const RULE_CODES = [...YES_NO_RULES.map((rule) => rule.code), GATE_TIME_RULE, NOTES_RULE] as const;

/** What `submit_property_for_review` can report as missing, and where the owner fixes it. */
export const MISSING_ITEMS = {
  description: { label: "A description of at least 30 characters", tab: "basics" },
  address: { label: "Address, locality and city", tab: "location" },
  map_pin: { label: "A pin on the map", tab: "location" },
  photos: { label: "At least one photo", tab: "photos" },
  beds: { label: "At least one room with a bed", tab: "rooms" },
  rent: { label: "The monthly rent", tab: "pricing" },
  availability: { label: "Availability", tab: "availability" },
} as const satisfies Record<string, { label: string; tab: EditorTab }>;

export const EDITOR_TABS = ["basics", "location", "pricing", "rooms", "availability", "amenities", "rules", "photos"] as const;
export type EditorTab = (typeof EDITOR_TABS)[number];

export function missingItemLabel(code: string): string {
  return (MISSING_ITEMS as Record<string, { label: string }>)[code]?.label ?? code.replace(/_/g, " ");
}

// ───────────────────────────── field helpers ─────────────────────────────

/** "" from an untouched input becomes null, so optional text never stores an empty string. */
const optionalText = (min: number, max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .refine((value) => value === "" || value.length >= min, message)
    .transform((value) => (value === "" ? null : value));

const PHONE_PATTERN = /^\+?[1-9][0-9]{9,14}$/;

/** Spaces and dashes are dropped: "98765 43210" -> "9876543210". Matches the SQL CHECK. */
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(PHONE_PATTERN, "Enter a valid phone number, like 9876543210 or +919876543210."));

const optionalPhone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s-]/g, ""))
  .pipe(
    z.union([z.literal(""), z.string().regex(PHONE_PATTERN, "Enter a valid number, like 9876543210.")]),
  )
  .transform((value) => (value === "" ? null : value));

const optionalEmail = z
  .string()
  .trim()
  .max(254, "That e-mail address is too long.")
  .pipe(z.union([z.literal(""), z.email("Enter a valid e-mail address.")]))
  .transform((value) => (value === "" ? null : value.toLowerCase()));

const MONEY_MAX = 10_000_000;
const MONEY_MESSAGE = "Enter a whole amount in rupees (no paise).";

/** Integer INR from a text/number input; "" -> null. */
export const optionalMoney = z
  .union([z.literal(""), z.null(), z.coerce.number({ error: MONEY_MESSAGE }).int(MONEY_MESSAGE).min(0, MONEY_MESSAGE).max(MONEY_MAX, "That amount is too large.")])
  .transform((value) => (value === "" || value === null ? null : value));

/** Integer INR, required: an empty input is an error (never silently 0). */
export const requiredMoney = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.coerce
    .number({ error: "Enter the amount in rupees." })
    .int(MONEY_MESSAGE)
    .min(0, MONEY_MESSAGE)
    .max(MONEY_MAX, "That amount is too large."),
);

const optionalInt = (min: number, max: number, message: string) =>
  z
    .union([z.literal(""), z.null(), z.coerce.number({ error: message }).int(message).min(min, message).max(max, message)])
    .transform((value) => (value === "" || value === null ? null : value));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const optionalDate = z
  .union([z.literal(""), z.null(), z.string().regex(ISO_DATE, "Choose a date.")])
  .refine((value) => !value || (value >= "2020-01-01" && value <= "2100-01-01"), "Choose a realistic date.")
  .transform((value) => (value === "" || value === null ? null : value));

const uuid = z.uuid("That id is not valid.");

// ───────────────────────────── becoming an owner / owner profile ─────────────────────────────

export const becomeOwnerSchema = z.object({
  owner_type: z.enum(OWNER_TYPES, { error: "Choose what describes you." }),
  business_name: optionalText(2, 120, "Use 2 to 120 characters."),
  contact_phone: phone,
  whatsapp_number: optionalPhone,
  contact_email: optionalEmail,
});
export type BecomeOwnerFormValues = z.input<typeof becomeOwnerSchema>;
export type BecomeOwnerInput = z.output<typeof becomeOwnerSchema>;

export const ownerProfileSchema = becomeOwnerSchema.extend({
  about: optionalText(1, 1000, "Keep it under 1,000 characters."),
});
export type OwnerProfileFormValues = z.input<typeof ownerProfileSchema>;
export type OwnerProfileInput = z.output<typeof ownerProfileSchema>;

// ───────────────────────────── property sections ─────────────────────────────

export const propertyIdSchema = z.object({ property_id: uuid });
export type PropertyIdInput = z.output<typeof propertyIdSchema>;

export const basicsSchema = z.object({
  title: z.string().trim().min(3, "Use at least 3 characters.").max(120, "Keep the title under 120 characters."),
  property_type: z.enum(PROPERTY_TYPES, { error: "Choose a property type." }),
  listing_mode: z.enum(LISTING_MODES, { error: "Choose how you let it." }),
  tenant_gender: z.enum(TENANT_GENDERS, { error: "Choose who can stay." }),
  furnishing: z.union([z.literal(""), z.enum(FURNISHINGS)]).transform((value) => (value === "" ? null : value)),
  description: optionalText(1, 4000, "Keep the description under 4,000 characters."),
});
export type BasicsFormValues = z.input<typeof basicsSchema>;
export type BasicsInput = z.output<typeof basicsSchema>;

export const updateBasicsSchema = basicsSchema.extend({ property_id: uuid });
export type UpdateBasicsInput = z.output<typeof updateBasicsSchema>;

/** A pin must be in or around India (mirrors properties_location_in_india). */
export const latSchema = z.number({ error: "Place the pin on the map." }).min(6, "Place the pin in India.").max(38, "Place the pin in India.");
export const lngSchema = z.number({ error: "Place the pin on the map." }).min(68, "Place the pin in India.").max(98, "Place the pin in India.");

export const locationSchema = z
  .object({
    property_id: uuid,
    address_line: z.string().trim().min(3, "Enter the street address.").max(200, "Keep it under 200 characters."),
    locality: z.string().trim().min(2, "Enter the locality or area.").max(80, "Keep it under 80 characters."),
    city: z.string().trim().min(2, "Choose a city.").max(80),
    state: optionalText(2, 60, "Use 2 to 60 characters."),
    pincode: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.string().regex(/^[1-9][0-9]{5}$/, "Enter a 6-digit PIN code.")]))
      .transform((value) => (value === "" ? null : value)),
    landmark: optionalText(2, 120, "Use 2 to 120 characters."),
    lat: latSchema.nullable(),
    lng: lngSchema.nullable(),
  })
  .refine((value) => (value.lat === null) === (value.lng === null), {
    path: ["lat"],
    message: "Place the pin on the map.",
  });
export type LocationFormValues = z.input<typeof locationSchema>;
export type LocationInput = z.output<typeof locationSchema>;

export const pricingSchema = z
  .object({
    property_id: uuid,
    monthly_rent: optionalMoney,
    security_deposit: optionalMoney,
    maintenance_monthly: optionalMoney,
    electricity_billing: z.enum(UTILITY_BILLINGS, { error: "Choose how electricity is billed." }),
    electricity_monthly_estimate: optionalMoney,
    water_billing: z.enum(UTILITY_BILLINGS, { error: "Choose how water is billed." }),
    water_monthly_estimate: optionalMoney,
    food_available: z.boolean(),
    food_included: z.boolean(),
    food_monthly_charge: optionalMoney,
    meals_breakfast: z.boolean(),
    meals_lunch: z.boolean(),
    meals_dinner: z.boolean(),
  })
  // Keep the row consistent with properties_food_consistent and drop amounts that do not apply.
  .transform((value) => ({
    ...value,
    electricity_monthly_estimate: value.electricity_billing === "included" ? null : value.electricity_monthly_estimate,
    water_monthly_estimate: value.water_billing === "included" ? null : value.water_monthly_estimate,
    food_included: value.food_available ? value.food_included : false,
    food_monthly_charge: value.food_available && !value.food_included ? value.food_monthly_charge : null,
    meals_breakfast: value.food_available && value.meals_breakfast,
    meals_lunch: value.food_available && value.meals_lunch,
    meals_dinner: value.food_available && value.meals_dinner,
  }));
export type PricingFormValues = z.input<typeof pricingSchema>;
export type PricingInput = z.output<typeof pricingSchema>;

export const roomSchema = z.object({
  property_id: uuid,
  room_id: uuid.optional(),
  name: z.string().trim().min(1, "Name the room, e.g. Room 101.").max(60, "Keep it under 60 characters."),
  room_type: z.enum(ROOM_TYPES),
  capacity: z.coerce
    .number({ error: "Enter how many people share it." })
    .int("Enter a whole number.")
    .min(1, "At least 1.")
    .max(12, "At most 12 per room."),
  rent_per_bed: requiredMoney,
  security_deposit: optionalMoney,
  has_attached_bathroom: z.boolean(),
  has_ac: z.boolean(),
  has_balcony: z.boolean(),
  floor: optionalInt(-3, 150, "Enter a floor between -3 and 150."),
  description: optionalText(1, 1000, "Keep it under 1,000 characters."),
});
export type RoomFormValues = z.input<typeof roomSchema>;
export type RoomInput = z.output<typeof roomSchema>;

export const roomIdSchema = z.object({ room_id: uuid });

export const addBedSchema = z.object({
  room_id: uuid,
  label: z.string().trim().min(1, "Label the bed.").max(30, "Keep it under 30 characters."),
});
export type AddBedInput = z.output<typeof addBedSchema>;

export const updateBedSchema = z.object({
  bed_id: uuid,
  status: z.enum(BED_STATUSES),
  available_from: optionalDate,
  rent_override: optionalMoney,
});
export type UpdateBedFormValues = z.input<typeof updateBedSchema>;
export type UpdateBedInput = z.output<typeof updateBedSchema>;

export const bedIdSchema = z.object({ bed_id: uuid });

export const availabilitySchema = z.object({
  property_id: uuid,
  status: z.enum(AVAILABILITY_STATUSES),
  available_from: optionalDate,
  min_stay_months: optionalInt(0, 60, "Enter 0 to 60 months."),
  notice_period_days: optionalInt(0, 365, "Enter 0 to 365 days."),
});
export type AvailabilityFormValues = z.input<typeof availabilitySchema>;
export type AvailabilityInput = z.output<typeof availabilitySchema>;

export const amenitiesSchema = z.object({
  property_id: uuid,
  amenity_codes: z
    .array(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/, "Unknown amenity."))
    .max(60)
    .transform((codes) => [...new Set(codes)].sort()),
});
export type AmenitiesInput = z.output<typeof amenitiesSchema>;

const ruleChoice = z.enum(["unset", "allowed", "not_allowed"]);
export type RuleChoice = z.infer<typeof ruleChoice>;

export const rulesSchema = z.object({
  property_id: uuid,
  choices: z.partialRecord(z.enum(YES_NO_RULES.map((rule) => rule.code) as [YesNoRuleCode, ...YesNoRuleCode[]]), ruleChoice),
  gate_closing_time: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:30.")]))
    .transform((value) => (value === "" ? null : value)),
  notes: optionalText(1, 300, "Keep it under 300 characters."),
});
export type RulesFormValues = z.input<typeof rulesSchema>;
export type RulesInput = z.output<typeof rulesSchema>;

export type RuleRow = { rule_code: string; allowed: boolean | null; value: string | null; note: string | null };

/** The rows `property_rules` should hold for the submitted form (pure; unit-tested). */
export function rulesToRows(input: RulesInput): RuleRow[] {
  const rows: RuleRow[] = [];
  for (const rule of YES_NO_RULES) {
    const choice = input.choices[rule.code];
    if (choice === "allowed" || choice === "not_allowed") {
      rows.push({ rule_code: rule.code, allowed: choice === "allowed", value: null, note: null });
    }
  }
  if (input.gate_closing_time) rows.push({ rule_code: GATE_TIME_RULE, allowed: null, value: input.gate_closing_time, note: null });
  if (input.notes) rows.push({ rule_code: NOTES_RULE, allowed: null, value: null, note: input.notes });
  return rows;
}

export const chargeSchema = z.object({
  label: z.string().trim().min(2, "Name the charge.").max(80, "Keep it under 80 characters."),
  amount: requiredMoney,
  frequency: z.enum(CHARGE_FREQUENCIES),
  is_mandatory: z.boolean(),
});
export const chargesSchema = z.object({
  property_id: uuid,
  charges: z.array(chargeSchema).max(20, "At most 20 extra charges."),
});
export type ChargesFormValues = z.input<typeof chargesSchema>;
export type ChargesInput = z.output<typeof chargesSchema>;

export const PROPERTY_MEDIA_MAX_BYTES = 8 * 1024 * 1024;
export const PROPERTY_MEDIA_MAX_COUNT = 40;

/** `<property_id>/<uuid>.webp` — the only object names the editor creates. */
export function isOwnMediaPath(propertyId: string, path: string): boolean {
  const match = /^([0-9a-f-]{36})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/i.exec(path);
  return match !== null && match[1]!.toLowerCase() === propertyId.toLowerCase();
}

export const registerMediaSchema = z
  .object({
    property_id: uuid,
    storage_path: z.string().max(300),
    width: z.number().int().min(1).max(20_000),
    height: z.number().int().min(1).max(20_000),
    size_bytes: z.number().int().min(1).max(PROPERTY_MEDIA_MAX_BYTES, "Photos must be 8 MB or smaller."),
    alt_text: optionalText(1, 200, "Keep it under 200 characters.").optional(),
  })
  .refine((value) => isOwnMediaPath(value.property_id, value.storage_path), {
    path: ["storage_path"],
    message: "That upload does not belong to this listing.",
  });
export type RegisterMediaInput = z.output<typeof registerMediaSchema>;

export const mediaIdSchema = z.object({ media_id: uuid });
export const reorderMediaSchema = z.object({
  property_id: uuid,
  media_ids: z.array(uuid).min(1).max(PROPERTY_MEDIA_MAX_COUNT),
});
export type ReorderMediaInput = z.output<typeof reorderMediaSchema>;

export const OWNER_SETTABLE_STATUSES = ["published", "paused", "archived"] as const satisfies readonly ListingStatus[];
export const setListingStatusSchema = z.object({
  property_id: uuid,
  status: z.enum(OWNER_SETTABLE_STATUSES),
});
export type SetListingStatusInput = z.output<typeof setListingStatusSchema>;

export const inquiryIdSchema = z.object({ inquiry_id: uuid });

export const replyToReviewSchema = z.object({
  review_id: uuid,
  body: z.string().trim().min(2, "Write a reply.").max(2000, "Keep it under 2,000 characters."),
});
export type ReplyToReviewInput = z.output<typeof replyToReviewSchema>;

// ───────────────────────────── DTOs (rows as the portal sees them) ─────────────────────────────

export type LatLng = { lat: number; lng: number };

export type OwnerAccount = {
  owner_type: OwnerType;
  business_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  about: string | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  created_at: string;
};

export type OwnerPropertySummary = {
  id: string;
  slug: string;
  title: string;
  status: ListingStatus;
  rejection_reason: string | null;
  listing_mode: ListingMode;
  property_type: PropertyType;
  locality: string | null;
  city: string | null;
  min_rent: number | null;
  max_rent: number | null;
  monthly_rent: number | null;
  total_beds: number;
  available_beds: number;
  cover_url: string | null;
  last_confirmed_at: string | null;
  submitted_at: string | null;
  published_at: string | null;
  updated_at: string;
};

export type OwnerBed = {
  id: string;
  room_id: string;
  label: string;
  status: BedStatus;
  available_from: string | null;
  rent_override: number | null;
};

export type OwnerRoom = {
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
  description: string | null;
  position: number;
  beds: OwnerBed[];
};

export type OwnerMedia = {
  id: string;
  storage_path: string;
  url: string;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  position: number;
  is_cover: boolean;
};

export type OwnerCharge = z.output<typeof chargeSchema> & { id: string };

export type OwnerAvailability = {
  status: AvailabilityStatus;
  available_from: string | null;
  min_stay_months: number | null;
  notice_period_days: number | null;
  last_confirmed_at: string | null;
};

export type OwnerPropertyDetail = {
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
  location: LatLng | null;
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
  meals_breakfast: boolean;
  meals_lunch: boolean;
  meals_dinner: boolean;
  status: ListingStatus;
  rejection_reason: string | null;
  submitted_at: string | null;
  published_at: string | null;
  last_confirmed_at: string | null;
  total_beds: number;
  available_beds: number;
  rooms: OwnerRoom[];
  media: OwnerMedia[];
  amenity_codes: string[];
  rules: RuleRow[];
  charges: OwnerCharge[];
  availability: OwnerAvailability | null;
};

export type CityOption = { slug: string; name: string; state: string; center: LatLng | null };
export type AmenityOption = { code: string; name: string; category: string };

export type OwnerInquiry = {
  id: string;
  property_id: string;
  property_title: string;
  seeker_name: string;
  message: string;
  move_in_date: string | null;
  occupants: number;
  status: InquiryStatus;
  conversation_id: string | null;
  created_at: string;
};

export type ListingPerformance = {
  property_id: string;
  title: string;
  views: number;
  saves: number;
  inquiries: number;
  contact_reveals: number;
};

export type OwnerDashboard = {
  account: OwnerAccount;
  counts: Record<ListingStatus, number>;
  new_inquiries: number;
  recent_inquiries: OwnerInquiry[];
  performance: ListingPerformance[];
  performance_days: number;
};

export type OwnerReview = {
  id: string;
  property_id: string;
  property_title: string;
  author_name: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
  reply: { body: string; updated_at: string } | null;
};

export type OwnerVerificationRecord = {
  id: string;
  subject_type: string;
  kind: Enums["verification_kind"];
  status: VerificationStatus;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type SubmitResult = { submitted: boolean; missing: string[] };
