import { z } from "zod";

import { GENDER_LABELS, GENDERS, OCCUPATION_LABELS, OCCUPATIONS } from "@/features/account/schemas";
import type { Database } from "@/lib/database.types";

import { DEAL_BREAKER_CODES, FACTORS, type DealBreakerCode } from "./compatibility";

/** Roommate contracts (isomorphic). Field names are database columns (snake_case). */

type Enums = Database["public"]["Enums"];

export { GENDER_LABELS, GENDERS, OCCUPATION_LABELS, OCCUPATIONS };

export type RoommateProfileStatus = Enums["roommate_profile_status"];
export type SwipeAction = Enums["swipe_action"];

export const DEAL_BREAKER_LABELS: Record<DealBreakerCode, string> = {
  smoking: "Smoking",
  drinking: "Regular drinking",
  non_veg: "Non-veg food",
  pets: "Pets",
  overnight_guests: "Overnight guests",
  loud_music: "Loud music",
  messy: "Messy spaces",
  late_rent: "Late rent",
};

export const FURNISHINGS = ["unfurnished", "semi_furnished", "fully_furnished"] as const satisfies readonly Enums["furnishing"][];
export const FURNISHING_LABELS: Record<Enums["furnishing"], string> = {
  unfurnished: "Unfurnished",
  semi_furnished: "Semi-furnished",
  fully_furnished: "Fully furnished",
};

export const ROOMMATE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const ROOMMATE_PHOTO_LIMIT = 6;

// ───────────────────────────── form input ─────────────────────────────

/** "" from an untouched input becomes null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .transform((value) => (value === "" ? null : value));

/** Number inputs arrive as strings from the form; "" means not set. */
const optionalInt = (min: number, max: number, label: string) =>
  z
    .union([z.number(), z.string()])
    .transform((value, ctx) => {
      if (value === "" || value === null) return null;
      const parsed = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        ctx.addIssue({ code: "custom", message: `${label} must be a whole number from ${min.toLocaleString("en-IN")} to ${max.toLocaleString("en-IN")}.` });
        return z.NEVER;
      }
      return parsed;
    });

const isoDate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      ctx.addIssue({ code: "custom", message: "Pick a valid date." });
      return z.NEVER;
    }
    return value;
  });

export const placeSchema = z.object({
  title: z.string().trim().min(3, "Give your place a short title.").max(100),
  description: optionalText(1000),
  locality: optionalText(80),
  rent_share: optionalInt(0, 1_000_000, "Rent share"),
  deposit_share: optionalInt(0, 5_000_000, "Deposit share"),
  vacancies: optionalInt(1, 10, "Vacancies"),
  available_from: isoDate,
  furnishing: z.union([z.enum(FURNISHINGS), z.literal("")]).transform((value) => (value === "" ? null : value)),
});

export const roommateProfileSchema = z
  .object({
    headline: z.string().trim().min(3, "Write a short headline (at least 3 characters).").max(80),
    about: optionalText(1000),
    age: optionalInt(18, 99, "Age").refine((value) => value !== null, "Enter your age."),
    gender: z.union([z.enum(GENDERS), z.literal("")]).transform((value, ctx) => {
      if (value === "") {
        ctx.addIssue({ code: "custom", message: "Choose your gender." });
        return z.NEVER;
      }
      return value;
    }),
    occupation: z.union([z.enum(OCCUPATIONS), z.literal("")]).transform((value) => (value === "" ? null : value)),
    occupation_detail: optionalText(120),
    city: z.string().trim().min(2, "Choose a city.").max(80),
    preferred_localities: z
      .array(z.string().trim().min(2).max(80))
      .max(10, "Up to 10 localities.")
      .transform((values) => [...new Set(values.filter(Boolean))]),
    budget_min: optionalInt(0, 1_000_000, "Minimum budget").refine((value) => value !== null, "Enter your minimum budget."),
    budget_max: optionalInt(0, 1_000_000, "Maximum budget").refine((value) => value !== null, "Enter your maximum budget."),
    move_in_date: isoDate,
    has_place: z.boolean(),
    place: placeSchema.nullable(),
    preferred_genders: z.array(z.enum(GENDERS)).max(4),
    age_min: optionalInt(18, 99, "Minimum age"),
    age_max: optionalInt(18, 99, "Maximum age"),
    occupation_prefs: z.array(z.enum(OCCUPATIONS)).max(3),
    answers: z.record(z.string().regex(/^[a-z][a-z0-9_]{1,39}$/), z.number().int().min(1).max(10)),
    deal_breakers: z.array(z.enum(DEAL_BREAKER_CODES)).max(DEAL_BREAKER_CODES.length),
    status: z.enum(["active", "paused", "draft"]),
  })
  .superRefine((value, ctx) => {
    if (value.budget_min !== null && value.budget_max !== null && value.budget_min > value.budget_max) {
      ctx.addIssue({ code: "custom", path: ["budget_max"], message: "Maximum budget must be at least the minimum." });
    }
    if (value.age_min !== null && value.age_max !== null && value.age_min > value.age_max) {
      ctx.addIssue({ code: "custom", path: ["age_max"], message: "Maximum age must be at least the minimum." });
    }
    if (value.has_place && !value.place) {
      ctx.addIssue({ code: "custom", path: ["place", "title"], message: "Tell people about your place." });
    }
  });

export type RoommateProfileInput = z.output<typeof roommateProfileSchema>;
export type RoommateProfileFormValues = z.input<typeof roommateProfileSchema>;

export const profileStatusSchema = z.object({ status: z.enum(["active", "paused"]) });

export const swipeSchema = z.object({
  target_id: z.uuid("That profile is not valid."),
  action: z.enum(["like", "pass"]),
});
export type SwipeInput = z.infer<typeof swipeSchema>;

export const photoSchema = z.object({
  storage_path: z
    .string()
    .min(10)
    .max(300)
    .regex(/^[0-9a-f-]{36}\/[A-Za-z0-9._-]+$/, "That photo path is not valid."),
});

// ───────────────────────────── rows from the database ─────────────────────────────

const nullableString = z.string().nullable().catch(null);
const nullableInt = z.number().int().nullable().catch(null);

/** One roommate card as returned (jsonb) by roommate_candidates() / roommate_profile_cards(). */
export const cardRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().catch("Member"),
  avatar_path: nullableString,
  status: z.enum(["draft", "active", "paused"]),
  headline: nullableString,
  about: nullableString,
  age: nullableInt,
  gender: z.enum(GENDERS).nullable().catch(null),
  occupation: z.enum(OCCUPATIONS).nullable().catch(null),
  occupation_detail: nullableString,
  city: nullableString,
  preferred_localities: z.array(z.string()).catch([]),
  budget_min: nullableInt,
  budget_max: nullableInt,
  move_in_date: nullableString,
  has_place: z.boolean().catch(false),
  last_active_at: nullableString,
  photos: z.array(z.string()).catch([]),
  answers: z.record(z.string(), z.number()).catch({}),
  deal_breakers: z.array(z.string()).catch([]),
  preferences: z
    .object({
      preferred_genders: z.array(z.enum(GENDERS)).catch([]),
      age_min: nullableInt,
      age_max: nullableInt,
      occupation_prefs: z.array(z.enum(OCCUPATIONS)).catch([]),
    })
    .nullable()
    .catch(null),
  place: z
    .object({
      title: z.string(),
      description: nullableString,
      property_type: nullableString,
      locality: nullableString,
      city: nullableString,
      rent_share: nullableInt,
      deposit_share: nullableInt,
      vacancies: nullableInt,
      available_from: nullableString,
      furnishing: z.enum(FURNISHINGS).nullable().catch(null),
    })
    .nullable()
    .catch(null),
});
export type CardRow = z.infer<typeof cardRowSchema>;

export type LifestyleQuestion = {
  code: string;
  factor: string;
  prompt: string;
  kind: "scale" | "choice";
  options: { value: number; label: string }[];
  position: number;
};

export type City = { slug: string; name: string };

// ───────────────────────────── DTOs sent to the browser ─────────────────────────────

/** What another person's card looks like in the browser: no answers, deal-breakers or preferences. */
export type PublicRoommateCard = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  headline: string | null;
  about: string | null;
  age: number | null;
  gender: CardRow["gender"];
  occupation: CardRow["occupation"];
  occupation_detail: string | null;
  city: string | null;
  preferred_localities: string[];
  budget_min: number | null;
  budget_max: number | null;
  move_in_date: string | null;
  has_place: boolean;
  place: CardRow["place"];
  photo_urls: string[];
};

export type CompatibilitySummary = {
  score: number;
  confidence: "high" | "medium" | "low";
  insufficient_data: boolean;
  shared: string[];
  conflicts: string[];
  explanation: string;
};

export type DeckCandidate = PublicRoommateCard & { compatibility: CompatibilitySummary };

export type SwipeResult = {
  matched: boolean;
  new_match: boolean;
  match_id: string | null;
  conversation_id: string | null;
};

export type MatchItem = {
  id: string;
  status: Enums["match_status"];
  matched_at: string;
  conversation_id: string | null;
  person: PublicRoommateCard | null;
  /** Shown when the other person's profile is no longer visible. */
  fallback_name: string;
  compatibility: CompatibilitySummary | null;
};

export type OwnRoommateProfile = {
  exists: boolean;
  status: RoommateProfileStatus;
  values: RoommateProfileFormValues;
  photos: { id: string; storage_path: string; url: string | null }[];
};

export const FACTOR_KEYS = FACTORS;
