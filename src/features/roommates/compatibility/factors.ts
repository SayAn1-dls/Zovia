import { getAnswer, optionCount, type QuestionCode } from "./questions";
import type { Factor, RoommateCard } from "./types";

/**
 * Factor scorers. Each returns 0..1, or null when either person lacks the
 * data. Every scorer is symmetric in its arguments.
 */

/** Ordinal closeness on an n-point question: 1 - |x - y| / (n - 1). */
export function ordinalCloseness(x: number, y: number, points: number): number {
  return 1 - Math.abs(x - y) / (points - 1);
}

/** Closeness of two cards on one ordinal question, or null when unanswered. */
export function answerCloseness(
  a: RoommateCard,
  b: RoommateCard,
  code: QuestionCode,
): number | null {
  const x = getAnswer(a, code);
  const y = getAnswer(b, code);
  if (x === null || y === null) return null;
  return ordinalCloseness(x, y, optionCount(code));
}

/** Symmetric lookup in a matrix keyed "low-high". Throws on a missing pair. */
export function matrixScore(
  matrix: Readonly<Record<string, number>>,
  x: number,
  y: number,
): number {
  const key = `${Math.min(x, y)}-${Math.max(x, y)}`;
  const value = matrix[key];
  if (value === undefined) {
    throw new RangeError(`no matrix entry for the pair ${key}`);
  }
  return value;
}

function weightedMean(
  parts: readonly { score: number | null; weight: number }[],
): number | null {
  let total = 0;
  let weights = 0;
  for (const part of parts) {
    if (part.score === null) continue;
    total += part.score * part.weight;
    weights += part.weight;
  }
  return weights === 0 ? null : total / weights;
}

// ── budget ──────────────────────────────────────────────────────────────────

export interface BudgetRange {
  min: number;
  max: number;
}

/**
 * A card's budget range, or null when `budget_max` is missing or a bound is
 * not a non-negative finite number. A missing `budget_min` is 0; reversed
 * bounds are swapped.
 */
export function budgetRange(card: RoommateCard): BudgetRange | null {
  const max = card.budget_max;
  const min = card.budget_min ?? 0;
  if (typeof max !== "number" || !Number.isFinite(max) || max < 0) return null;
  if (typeof min !== "number" || !Number.isFinite(min) || min < 0) return null;
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

/** Score when two ranges only touch (overlap of zero width). */
export const BUDGET_TOUCH_SCORE = 0.75;

/**
 * Budget fit from range overlap.
 *
 *   overlap = min(a.max, b.max) - max(a.min, b.min)
 *
 *   overlap >= 0 (ranges intersect):
 *     share = overlap / width of the narrower range   (1 when that width is 0)
 *     score = 0.75 + 0.25 * min(1, share / 0.5)
 *     -> 1 once the overlap covers at least half of the narrower range,
 *        0.75 when the ranges merely touch.
 *
 *   overlap < 0 (a gap of -overlap rupees):
 *     limit = min(a.max, b.max) / 2          (half of the lower maximum)
 *     score = 0.75 * max(0, 1 - gap / limit)
 *     -> falls linearly from 0.75 to 0 as the gap reaches `limit`.
 *
 * Continuous at the touching point and never increases as ranges move apart.
 */
export function scoreBudget(a: RoommateCard, b: RoommateCard): number | null {
  const x = budgetRange(a);
  const y = budgetRange(b);
  if (x === null || y === null) return null;

  const overlap = Math.min(x.max, y.max) - Math.max(x.min, y.min);
  if (overlap >= 0) {
    const narrower = Math.min(x.max - x.min, y.max - y.min);
    const share = narrower === 0 ? 1 : overlap / narrower;
    return (
      BUDGET_TOUCH_SCORE + (1 - BUDGET_TOUCH_SCORE) * Math.min(1, share / 0.5)
    );
  }

  const gap = -overlap;
  const limit = Math.min(x.max, y.max) / 2;
  if (limit <= 0 || gap >= limit) return 0;
  return BUDGET_TOUCH_SCORE * (1 - gap / limit);
}

// ── cleanliness, sleep ──────────────────────────────────────────────────────

/** 1 - |difference| / 4 on the five-point cleanliness scale. */
export function scoreCleanliness(
  a: RoommateCard,
  b: RoommateCard,
): number | null {
  return answerCloseness(a, b, "cleanliness");
}

/** 1 - |difference| / 4 on the five-point sleep_schedule scale. */
export function scoreSleep(a: RoommateCard, b: RoommateCard): number | null {
  return answerCloseness(a, b, "sleep_schedule");
}

// ── schedule ────────────────────────────────────────────────────────────────

/**
 * schedule: 1 daytime, 2 night shift, 3 flexible or hybrid, 4 at home,
 * 5 irregular. Same value -> 1.
 *
 *            day  night  flex  home  irregular
 * day         1    0.2   0.8   0.7    0.5
 * night            1     0.7   0.6    0.5
 * flex                   1     0.8    0.7
 * home                         1      0.6
 * irregular                           1
 *
 * Day vs night is the hard case (each sleeps while the other is active).
 * Flexible and at-home people can adapt, so they sit mid-to-high with anyone.
 */
export const SCHEDULE_MATRIX: Readonly<Record<string, number>> = {
  "1-1": 1,
  "1-2": 0.2,
  "1-3": 0.8,
  "1-4": 0.7,
  "1-5": 0.5,
  "2-2": 1,
  "2-3": 0.7,
  "2-4": 0.6,
  "2-5": 0.5,
  "3-3": 1,
  "3-4": 0.8,
  "3-5": 0.7,
  "4-4": 1,
  "4-5": 0.6,
  "5-5": 1,
};

export function scoreSchedule(a: RoommateCard, b: RoommateCard): number | null {
  const x = getAnswer(a, "schedule");
  const y = getAnswer(b, "schedule");
  if (x === null || y === null) return null;
  return matrixScore(SCHEDULE_MATRIX, x, y);
}

// ── food ────────────────────────────────────────────────────────────────────

/**
 * How alike two food habits are (1 vegetarian, 2 eggetarian,
 * 3 non-vegetarian, 4 vegan). Same habit -> 1.
 */
export const FOOD_HABIT_SIMILARITY: Readonly<Record<string, number>> = {
  "1-1": 1,
  "1-2": 0.75,
  "1-3": 0.5,
  "1-4": 0.85,
  "2-2": 1,
  "2-3": 0.75,
  "2-4": 0.6,
  "3-3": 1,
  "3-4": 0.4,
  "4-4": 1,
};

/**
 * KITCHEN_COMFORT[kitchen_preference][other person's food_habit]: how
 * comfortable someone with that kitchen preference is sharing a kitchen with
 * that habit.
 *
 *                      vegetarian  eggetarian  non-veg  vegan
 * 1 veg-only kitchen       1          0.4       0.05     1
 * 2 eggs are fine          1          1         0.4      1
 * 3 anything goes          1          1         1        1
 */
export const KITCHEN_COMFORT: Readonly<
  Record<number, Readonly<Record<number, number>>>
> = {
  1: { 1: 1, 2: 0.4, 3: 0.05, 4: 1 },
  2: { 1: 1, 2: 1, 3: 0.4, 4: 1 },
  3: { 1: 1, 2: 1, 3: 1, 4: 1 },
};

/** Comfort of a kitchen preference with a habit; 1 when no preference is stated. */
function kitchenComfort(kitchen: number | null, habit: number): number {
  if (kitchen === null) return 1;
  const comfort = KITCHEN_COMFORT[kitchen]?.[habit];
  if (comfort === undefined) {
    throw new RangeError(
      `no kitchen comfort for preference ${kitchen} and habit ${habit}`,
    );
  }
  return comfort;
}

/**
 * Food fit. Needs both food_habit answers.
 *
 *   same habit                 -> 1
 *   otherwise                  -> comfort * (0.5 + 0.5 * similarity)
 *
 * where `similarity` is FOOD_HABIT_SIMILARITY and `comfort` is the lower of
 * the two people's KITCHEN_COMFORT with the other's habit (a missing
 * kitchen_preference imposes no limit). Example: a vegetarian who wants a
 * veg-only kitchen with a non-vegetarian scores 0.05 * 0.75 = 0.0375.
 */
export function scoreFood(a: RoommateCard, b: RoommateCard): number | null {
  const habitA = getAnswer(a, "food_habit");
  const habitB = getAnswer(b, "food_habit");
  if (habitA === null || habitB === null) return null;
  if (habitA === habitB) return 1;

  const kitchenA = getAnswer(a, "kitchen_preference");
  const kitchenB = getAnswer(b, "kitchen_preference");
  const comfortA = kitchenComfort(kitchenA, habitB);
  const comfortB = kitchenComfort(kitchenB, habitA);
  const similarity = matrixScore(FOOD_HABIT_SIMILARITY, habitA, habitB);
  return Math.min(comfortA, comfortB) * (0.5 + 0.5 * similarity);
}

// ── smoking and drinking ────────────────────────────────────────────────────

/**
 * Ordinal closeness (1 - |difference| / 2) on smoking and on drinking,
 * averaged with weights 0.6 (smoking) and 0.4 (drinking) over the questions
 * both people answered. Smoking weighs more because it affects shared air.
 */
export function scoreSmokingDrinking(
  a: RoommateCard,
  b: RoommateCard,
): number | null {
  return weightedMean([
    { score: answerCloseness(a, b, "smoking"), weight: 0.6 },
    { score: answerCloseness(a, b, "drinking"), weight: 0.4 },
  ]);
}

// ── lifestyle ───────────────────────────────────────────────────────────────

/**
 * pets: 1 has a pet, 2 loves pets, 3 prefers no pets, 4 allergic.
 *
 *              has   loves  prefers-none  allergic
 * has           1     1        0.25         0
 * loves               1        0.7          0.6
 * prefers-none                 1            1
 * allergic                                  1
 */
export const PETS_MATRIX: Readonly<Record<string, number>> = {
  "1-1": 1,
  "1-2": 1,
  "1-3": 0.25,
  "1-4": 0,
  "2-2": 1,
  "2-3": 0.7,
  "2-4": 0.6,
  "3-3": 1,
  "3-4": 1,
  "4-4": 1,
};

/**
 * chores: 1 split with a schedule, 2 hire help and split the cost,
 * 3 everyone handles their own mess. Same -> 1; 1-2 -> 0.6; 2-3 -> 0.5;
 * 1-3 -> 0.3.
 */
export const CHORES_MATRIX: Readonly<Record<string, number>> = {
  "1-1": 1,
  "1-2": 0.6,
  "1-3": 0.3,
  "2-2": 1,
  "2-3": 0.5,
  "3-3": 1,
};

export function scorePets(a: RoommateCard, b: RoommateCard): number | null {
  const x = getAnswer(a, "pets");
  const y = getAnswer(b, "pets");
  if (x === null || y === null) return null;
  return matrixScore(PETS_MATRIX, x, y);
}

export function scoreChores(a: RoommateCard, b: RoommateCard): number | null {
  const x = getAnswer(a, "chores");
  const y = getAnswer(b, "chores");
  if (x === null || y === null) return null;
  return matrixScore(CHORES_MATRIX, x, y);
}

/**
 * Unweighted mean over the items both people answered: ordinal closeness on
 * social_level, noise, cooking, personal_space (five-point) and rent_payment
 * (three-point), plus PETS_MATRIX and CHORES_MATRIX.
 */
export function scoreLifestyle(
  a: RoommateCard,
  b: RoommateCard,
): number | null {
  return weightedMean(
    [
      answerCloseness(a, b, "social_level"),
      answerCloseness(a, b, "noise"),
      scorePets(a, b),
      answerCloseness(a, b, "cooking"),
      answerCloseness(a, b, "personal_space"),
      scoreChores(a, b),
      answerCloseness(a, b, "rent_payment"),
    ].map((score) => ({ score, weight: 1 })),
  );
}

// ── guests ──────────────────────────────────────────────────────────────────

/**
 * Mean of ordinal closeness on guests (five-point) and overnight_guests
 * (three-point), over the questions both people answered.
 */
export function scoreGuests(a: RoommateCard, b: RoommateCard): number | null {
  return weightedMean([
    { score: answerCloseness(a, b, "guests"), weight: 1 },
    { score: answerCloseness(a, b, "overnight_guests"), weight: 1 },
  ]);
}

// ── location ────────────────────────────────────────────────────────────────

/** Trimmed, lower-cased, inner whitespace collapsed. */
export function normaliseLocality(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalised, de-duplicated, non-empty localities of a card. */
export function localityKeys(card: RoommateCard): string[] {
  const keys = new Set<string>();
  for (const value of card.preferred_localities ?? []) {
    if (typeof value !== "string") continue;
    const key = normaliseLocality(value);
    if (key !== "") keys.add(key);
  }
  return [...keys];
}

export const LOCATION_NEUTRAL_SCORE = 0.5;

/**
 * Location fit. The candidate pool is already limited to one city upstream.
 *
 *   both cities known and different            -> 0
 *   either list of preferred localities empty  -> 0.5 (neutral)
 *   no locality in common                      -> 0.2
 *   otherwise    0.6 + 0.4 * shared / size of the shorter list
 *
 * Localities are compared case-insensitively after trimming.
 */
export function scoreLocation(a: RoommateCard, b: RoommateCard): number {
  if (
    typeof a.city === "string" &&
    typeof b.city === "string" &&
    a.city.trim() !== "" &&
    b.city.trim() !== "" &&
    normaliseLocality(a.city) !== normaliseLocality(b.city)
  ) {
    return 0;
  }
  const x = localityKeys(a);
  const y = new Set(localityKeys(b));
  if (x.length === 0 || y.size === 0) return LOCATION_NEUTRAL_SCORE;
  const shared = x.filter((key) => y.has(key)).length;
  if (shared === 0) return 0.2;
  return 0.6 + (0.4 * shared) / Math.min(x.length, y.size);
}

// ── registry ────────────────────────────────────────────────────────────────

export const FACTOR_SCORERS: Readonly<
  Record<Factor, (a: RoommateCard, b: RoommateCard) => number | null>
> = {
  budget: scoreBudget,
  cleanliness: scoreCleanliness,
  sleep: scoreSleep,
  food: scoreFood,
  smoking_drinking: scoreSmokingDrinking,
  lifestyle: scoreLifestyle,
  schedule: scoreSchedule,
  guests: scoreGuests,
  location: scoreLocation,
};

/** Score one factor: 0..1, or null when either person lacks the data. */
export function scoreFactor(
  factor: Factor,
  a: RoommateCard,
  b: RoommateCard,
): number | null {
  return FACTOR_SCORERS[factor](a, b);
}
