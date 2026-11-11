/**
 * Types of the roommate compatibility engine. Field names mirror the database
 * (snake_case); the shapes match what `roommate_candidates()` returns per row.
 */

/** Stored with every cached result; bump when scoring or wording changes. */
export const ALGORITHM_VERSION = 1;

export const FACTORS = [
  "budget",
  "cleanliness",
  "sleep",
  "food",
  "smoking_drinking",
  "lifestyle",
  "schedule",
  "guests",
  "location",
] as const;

export type Factor = (typeof FACTORS)[number];

export type CompatibilityWeights = Record<Factor, number>;

/** Defaults of `compatibility_weights` (spec 6.3). They sum to 1. */
export const DEFAULT_WEIGHTS: Readonly<CompatibilityWeights> = Object.freeze({
  budget: 0.2,
  cleanliness: 0.15,
  sleep: 0.15,
  food: 0.1,
  smoking_drinking: 0.1,
  lifestyle: 0.1,
  schedule: 0.1,
  guests: 0.05,
  location: 0.05,
});

export type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";
export type Occupation = "student" | "working_professional" | "other";

export interface RoommatePreferences {
  /** Empty or null = no preference. */
  preferred_genders: readonly Gender[] | null;
  age_min: number | null;
  age_max: number | null;
  /** Informational only: not a hard filter and not scored. */
  occupation_prefs: readonly Occupation[] | null;
}

export interface RoommateCard {
  user_id: string;
  age: number | null;
  gender: Gender | null;
  occupation: Occupation | null;
  city: string | null;
  preferred_localities: readonly string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  /** ISO date; carried for display, not scored. */
  move_in_date: string | null;
  /** ISO timestamp; used only to break ranking ties. */
  last_active_at?: string | null;
  /** question_code -> option value. Missing or invalid values count as unanswered. */
  answers: Readonly<Record<string, number>>;
  deal_breakers: readonly string[];
  preferences: RoommatePreferences | null;
}

export const DEAL_BREAKER_CODES = [
  "smoking",
  "drinking",
  "non_veg",
  "pets",
  "overnight_guests",
  "loud_music",
  "messy",
  "late_rent",
] as const;

export type DealBreakerCode = (typeof DEAL_BREAKER_CODES)[number];

export type PreferenceRule = "preferred_gender" | "age_range";

/** Which of the two arguments a rule belongs to. */
export type Side = "a" | "b";

export interface HardFilterFailure {
  kind: "deal_breaker" | "preference";
  rule: DealBreakerCode | PreferenceRule;
  /** The side that stated the rule; the other side violates it. */
  side: Side;
  holder_id: string;
  violator_id: string;
  /** Plain-English reason, for tests and admin debugging (not shown to users). */
  detail: string;
}

export interface HardFilterUnknown {
  /** A deal-breaker or preference rule; any other string is an unrecognised code. */
  rule: string;
  side: Side;
  reason: "unanswered" | "unrecognised_code";
}

export interface DealBreakerCheck {
  passed: boolean;
  failures: HardFilterFailure[];
  /** Rules that could not be evaluated. They never exclude anyone. */
  unknown: HardFilterUnknown[];
}

export type Confidence = "high" | "medium" | "low";

export interface FactorBreakdown {
  /** 0..1, or null when either person lacks the data. */
  score: number | null;
  /** The configured weight. */
  weight: number;
  /** The weight after renormalising over scored factors (0 when not scored). */
  effective_weight: number;
  /** `score * effective_weight`; contributions sum to `raw_score`. */
  contribution: number;
}

export interface CompatibilityResult {
  algorithm_version: number;
  /** Percentage 0..100, rounded. */
  score: number;
  /** Unrounded 0..1. */
  raw_score: number;
  confidence: Confidence;
  /** True when no factor could be scored; `score` is then 0 and means "unknown". */
  insufficient_data: boolean;
  factors_scored: number;
  /** Questions answered by both people. */
  answers_compared: number;
  breakdown: Record<Factor, FactorBreakdown>;
  /** Up to five things in common, strongest first. */
  shared: string[];
  /** Up to four potential friction points, weakest first. */
  conflicts: string[];
  explanation: string;
}

export interface RankedCandidate<T extends RoommateCard = RoommateCard> {
  candidate: T;
  result: CompatibilityResult;
}

export interface ExcludedCandidate<T extends RoommateCard = RoommateCard> {
  candidate: T;
  reason: "self" | "hard_filter";
  /** Present when `reason` is `hard_filter`. */
  check: DealBreakerCheck | null;
}

export interface Ranking<T extends RoommateCard = RoommateCard> {
  ranked: RankedCandidate<T>[];
  excluded: ExcludedCandidate<T>[];
}

export interface WeightsValidation {
  valid: boolean;
  errors: string[];
}
