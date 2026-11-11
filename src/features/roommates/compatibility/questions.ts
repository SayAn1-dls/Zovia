import type { Factor, RoommateCard } from "./types";

/**
 * The lifestyle questionnaire as the engine understands it. The database table
 * `lifestyle_questions` is the source of truth for prompts and labels shown in
 * the UI; codes, factors and option values here must match it exactly.
 *
 * `scale` questions are ordinal (closeness is meaningful); `choice` questions
 * are scored with explicit matrices or ordinal rules in factors.ts.
 * `describe` holds short neutral descriptors used in generated phrases.
 */
interface QuestionDefinition {
  factor: Factor;
  kind: "scale" | "choice";
  options: Readonly<Record<number, string>>;
  describe: Readonly<Record<number, string>>;
}

export const LIFESTYLE_QUESTIONS = {
  food_habit: {
    factor: "food",
    kind: "choice",
    options: {
      1: "Vegetarian",
      2: "Eggetarian",
      3: "Non-vegetarian",
      4: "Vegan",
    },
    describe: {
      1: "vegetarian",
      2: "eggetarian",
      3: "non-vegetarian",
      4: "vegan",
    },
  },
  kitchen_preference: {
    factor: "food",
    kind: "choice",
    options: {
      1: "Veg-only kitchen please",
      2: "Eggs are fine",
      3: "Anything goes",
    },
    describe: {
      1: "wants a veg-only kitchen",
      2: "fine with eggs in the kitchen",
      3: "fine with anything in the kitchen",
    },
  },
  smoking: {
    factor: "smoking_drinking",
    kind: "choice",
    options: { 1: "Never", 2: "Occasionally, outside only", 3: "Regularly" },
    describe: { 1: "never", 2: "occasionally, outside only", 3: "regularly" },
  },
  drinking: {
    factor: "smoking_drinking",
    kind: "choice",
    options: { 1: "Never", 2: "Socially", 3: "Regularly" },
    describe: { 1: "never", 2: "socially", 3: "regularly" },
  },
  sleep_schedule: {
    factor: "sleep",
    kind: "scale",
    options: {
      1: "Early bird (asleep by 10 pm)",
      2: "Before midnight",
      3: "Around midnight",
      4: "After midnight",
      5: "Night owl (after 2 am)",
    },
    describe: {
      1: "early bird",
      2: "before midnight",
      3: "around midnight",
      4: "after midnight",
      5: "night owl",
    },
  },
  cleanliness: {
    factor: "cleanliness",
    kind: "scale",
    options: {
      1: "Very relaxed",
      2: "Relaxed",
      3: "Tidy enough",
      4: "Clean",
      5: "Spotless",
    },
    describe: {
      1: "very relaxed",
      2: "relaxed",
      3: "tidy enough",
      4: "clean",
      5: "spotless",
    },
  },
  social_level: {
    factor: "lifestyle",
    kind: "scale",
    options: {
      1: "Keep to myself",
      2: "Mostly private",
      3: "Balanced",
      4: "Social",
      5: "Very social",
    },
    describe: {
      1: "keeps to themselves",
      2: "mostly private",
      3: "balanced",
      4: "social",
      5: "very social",
    },
  },
  noise: {
    factor: "lifestyle",
    kind: "scale",
    options: {
      1: "Need quiet",
      2: "Mostly quiet",
      3: "Some background noise",
      4: "Music often",
      5: "Music out loud",
    },
    describe: {
      1: "needs quiet",
      2: "mostly quiet",
      3: "some background noise",
      4: "music often",
      5: "music out loud",
    },
  },
  pets: {
    factor: "lifestyle",
    kind: "choice",
    options: {
      1: "I have a pet",
      2: "Love pets",
      3: "Prefer no pets",
      4: "Allergic to pets",
    },
    describe: {
      1: "has a pet",
      2: "loves pets",
      3: "prefers no pets",
      4: "allergic to pets",
    },
  },
  cooking: {
    factor: "lifestyle",
    kind: "scale",
    options: {
      1: "Never cook",
      2: "Rarely",
      3: "Sometimes",
      4: "Often",
      5: "Cook daily",
    },
    describe: {
      1: "never",
      2: "rarely",
      3: "sometimes",
      4: "often",
      5: "daily",
    },
  },
  personal_space: {
    factor: "lifestyle",
    kind: "scale",
    options: {
      1: "Very private",
      2: "Private",
      3: "Balanced",
      4: "Open",
      5: "Share everything",
    },
    describe: {
      1: "very private",
      2: "private",
      3: "balanced",
      4: "open",
      5: "shares everything",
    },
  },
  chores: {
    factor: "lifestyle",
    kind: "choice",
    options: {
      1: "Split with a schedule",
      2: "Hire help and split the cost",
      3: "Everyone handles their own mess",
    },
    describe: {
      1: "split with a schedule",
      2: "hire help and split the cost",
      3: "everyone handles their own mess",
    },
  },
  rent_payment: {
    factor: "lifestyle",
    kind: "choice",
    options: {
      1: "Always on or before the due date",
      2: "Usually on time",
      3: "Sometimes late",
    },
    describe: {
      1: "always on time",
      2: "usually on time",
      3: "sometimes late",
    },
  },
  schedule: {
    factor: "schedule",
    kind: "choice",
    options: {
      1: "Daytime (roughly 9 to 6)",
      2: "Night shift",
      3: "Flexible or hybrid",
      4: "Work or study from home",
      5: "Irregular",
    },
    describe: {
      1: "daytime",
      2: "night shift",
      3: "flexible or hybrid",
      4: "working or studying from home",
      5: "irregular hours",
    },
  },
  guests: {
    factor: "guests",
    kind: "scale",
    options: {
      1: "Never",
      2: "Rarely",
      3: "Sometimes",
      4: "Often",
      5: "Very often",
    },
    describe: {
      1: "never",
      2: "rarely",
      3: "sometimes",
      4: "often",
      5: "very often",
    },
  },
  overnight_guests: {
    factor: "guests",
    kind: "choice",
    options: { 1: "Not okay", 2: "Occasionally with notice", 3: "Fine" },
    describe: { 1: "not okay", 2: "occasionally with notice", 3: "fine" },
  },
} as const satisfies Record<string, QuestionDefinition>;

export type QuestionCode = keyof typeof LIFESTYLE_QUESTIONS;

export const QUESTION_CODES = Object.keys(
  LIFESTYLE_QUESTIONS,
) as QuestionCode[];

/** Highest option value of a question (options are 1..n). */
export function optionCount(code: QuestionCode): number {
  return Object.keys(LIFESTYLE_QUESTIONS[code].options).length;
}

/**
 * A card's answer to a question, or null when it is unanswered. A value that
 * is not one of the question's options is treated as unanswered.
 */
export function getAnswer(
  card: Pick<RoommateCard, "answers">,
  code: QuestionCode,
): number | null {
  const answers = card.answers;
  if (
    answers === null ||
    typeof answers !== "object" ||
    !Object.prototype.hasOwnProperty.call(answers, code)
  ) {
    return null;
  }
  const value: unknown = answers[code];
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= optionCount(code) ? value : null;
}

/** Short neutral descriptor of an option, for generated phrases. */
export function describeAnswer(code: QuestionCode, value: number): string {
  const describe: Readonly<Record<number, string>> =
    LIFESTYLE_QUESTIONS[code].describe;
  const descriptor = describe[value];
  if (descriptor === undefined) {
    throw new RangeError(`${code} has no option ${value}`);
  }
  return descriptor;
}
