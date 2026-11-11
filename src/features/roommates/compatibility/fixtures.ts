/**
 * Test support for the compatibility engine: card builders and a seeded,
 * deterministic generator. Nothing here runs at import time and nothing here
 * is used by application code.
 */
import { optionCount, QUESTION_CODES } from "./questions";
import type { Gender, Occupation, RoommateCard } from "./types";

/** A complete, internally consistent set of answers. */
export const FULL_ANSWERS: Readonly<Record<string, number>> = Object.freeze({
  food_habit: 1,
  kitchen_preference: 1,
  smoking: 1,
  drinking: 2,
  sleep_schedule: 2,
  cleanliness: 5,
  social_level: 3,
  noise: 2,
  pets: 2,
  cooking: 4,
  personal_space: 3,
  chores: 1,
  rent_payment: 1,
  schedule: 1,
  guests: 2,
  overnight_guests: 2,
});

/** A card with no answers, no preferences and no budget. */
export function emptyCard(overrides: Partial<RoommateCard> = {}): RoommateCard {
  return {
    user_id: "user-a",
    age: null,
    gender: null,
    occupation: null,
    city: null,
    preferred_localities: [],
    budget_min: null,
    budget_max: null,
    move_in_date: null,
    last_active_at: null,
    answers: {},
    deal_breakers: [],
    preferences: null,
    ...overrides,
  };
}

/** A fully answered card. */
export function fullCard(overrides: Partial<RoommateCard> = {}): RoommateCard {
  return emptyCard({
    age: 24,
    gender: "female",
    occupation: "working_professional",
    city: "Bengaluru",
    preferred_localities: ["Koramangala", "HSR Layout"],
    budget_min: 8000,
    budget_max: 12000,
    move_in_date: "2026-12-01",
    last_active_at: "2026-11-10T10:00:00Z",
    answers: { ...FULL_ANSWERS },
    ...overrides,
  });
}

/** A copy of `card` with some answers replaced (undefined removes one). */
export function withAnswers(
  card: RoommateCard,
  changes: Record<string, number | undefined>,
): RoommateCard {
  const answers: Record<string, number> = { ...card.answers };
  for (const [code, value] of Object.entries(changes)) {
    if (value === undefined) delete answers[code];
    else answers[code] = value;
  }
  return { ...card, answers };
}

/** mulberry32: small deterministic PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOCALITIES = [
  "Koramangala",
  "HSR Layout",
  "Indiranagar",
  "Whitefield",
  "BTM Layout",
  "Marathahalli",
];
const GENDERS: Gender[] = ["male", "female", "non_binary", "prefer_not_to_say"];
const OCCUPATIONS: Occupation[] = ["student", "working_professional", "other"];

/**
 * A random but valid card. Roughly a quarter of answers, and sometimes the
 * budget and localities, are left out so that partial data is exercised.
 */
export function randomCard(random: () => number, id: string): RoommateCard {
  const integer = (low: number, high: number) =>
    low + Math.floor(random() * (high - low + 1));
  const answers: Record<string, number> = {};
  for (const code of QUESTION_CODES) {
    if (random() < 0.75) answers[code] = integer(1, optionCount(code));
  }
  const hasBudget = random() < 0.9;
  const budgetMin = integer(3, 30) * 1000;
  const localities = LOCALITIES.filter(() => random() < 0.35);
  return emptyCard({
    user_id: id,
    age: integer(18, 45),
    gender: GENDERS[integer(0, GENDERS.length - 1)],
    occupation: OCCUPATIONS[integer(0, OCCUPATIONS.length - 1)],
    city: "Bengaluru",
    preferred_localities: localities,
    budget_min: hasBudget ? budgetMin : null,
    budget_max: hasBudget ? budgetMin + integer(0, 10) * 1000 : null,
    answers,
  });
}
