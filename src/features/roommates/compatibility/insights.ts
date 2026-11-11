import { formatINR, formatINRRange } from "@/lib/pricing";

import {
  budgetRange,
  CHORES_MATRIX,
  localityKeys,
  matrixScore,
  normaliseLocality,
  ordinalCloseness,
  PETS_MATRIX,
  SCHEDULE_MATRIX,
  scoreBudget,
  scoreFood,
  scoreLocation,
} from "./factors";
import {
  describeAnswer,
  getAnswer,
  optionCount,
  type QuestionCode,
} from "./questions";
import type { CompatibilityWeights, Factor, RoommateCard } from "./types";

/**
 * Specific, human-readable agreements and friction points behind a score.
 *
 * An insight exists only when both people supplied the data it talks about,
 * so a factor without data is never mentioned. Wording is symmetric: where
 * two different answers are named, the lower option value comes first.
 */
export interface Insight {
  kind: "shared" | "conflict";
  factor: Factor;
  /** Short noun phrase used in the explanation ("sleep schedule"). */
  topic: string;
  /** 0..1 agreement on this specific item. */
  agreement: number;
  text: string;
}

export const MAX_SHARED = 5;
export const MAX_CONFLICTS = 4;

/** A specific item is a potential conflict at or below this agreement. */
const CONFLICT_THRESHOLD = 0.3;

interface OrdinalRule {
  code: QuestionCode;
  factor: Factor;
  topic: string;
  /** Text when both gave the same answer; null to stay silent. */
  same: (value: number, descriptor: string) => string | null;
  /** Text when a five-point answer differs by one step. */
  close?: (low: string, high: string) => string;
  /** Text when closeness is 0.25 or less. */
  conflict?: (low: string, high: string) => string;
}

const byValue =
  (texts: Readonly<Record<number, string>>) =>
  (value: number): string | null =>
    texts[value] ?? null;

const ORDINAL_RULES: readonly OrdinalRule[] = [
  {
    code: "cleanliness",
    factor: "cleanliness",
    topic: "cleanliness",
    same: byValue({
      1: "Both relaxed about tidiness",
      2: "Both relaxed about tidiness",
      3: "Both keep things tidy enough",
      4: "Both like a clean home",
      5: "Both keep things spotless",
    }),
    close: (low, high) => `Similar cleanliness standards: ${low} and ${high}`,
    conflict: (low, high) =>
      `Different cleanliness standards: ${low} vs ${high}`,
  },
  {
    code: "sleep_schedule",
    factor: "sleep",
    topic: "sleep schedule",
    same: (_value, descriptor) => `Similar sleep schedule: ${descriptor}`,
    close: (low, high) => `Close sleep schedules: ${low} and ${high}`,
    conflict: (low, high) => `Different sleep schedules: ${low} vs ${high}`,
  },
  {
    code: "smoking",
    factor: "smoking_drinking",
    topic: "smoking",
    same: byValue({
      1: "Neither smokes",
      2: "Both smoke occasionally, outside only",
      3: "Both smoke regularly",
    }),
    conflict: (low, high) => `Different smoking habits: ${low} vs ${high}`,
  },
  {
    code: "drinking",
    factor: "smoking_drinking",
    topic: "drinking",
    same: byValue({
      1: "Neither drinks",
      2: "Both drink socially",
      3: "Both drink regularly",
    }),
    conflict: (low, high) => `Different drinking habits: ${low} vs ${high}`,
  },
  {
    code: "social_level",
    factor: "lifestyle",
    topic: "social life",
    same: (_value, descriptor) => `Similar social style: ${descriptor}`,
    conflict: (low, high) => `Different social styles: ${low} vs ${high}`,
  },
  {
    code: "noise",
    factor: "lifestyle",
    topic: "noise",
    same: (_value, descriptor) => `Similar noise levels: ${descriptor}`,
    conflict: (low, high) => `Different noise levels: ${low} vs ${high}`,
  },
  {
    code: "cooking",
    factor: "lifestyle",
    topic: "cooking",
    same: byValue({
      1: "Neither cooks",
      2: "Both rarely cook",
      3: "Both cook sometimes",
      4: "Both cook often",
      5: "Both cook daily",
    }),
  },
  {
    code: "personal_space",
    factor: "lifestyle",
    topic: "personal space",
    same: (_value, descriptor) =>
      `Similar need for personal space: ${descriptor}`,
    conflict: (low, high) =>
      `Different needs for personal space: ${low} vs ${high}`,
  },
  {
    code: "rent_payment",
    factor: "lifestyle",
    topic: "rent payments",
    same: byValue({
      1: "Both pay rent on time",
      2: "Both usually pay rent on time",
    }),
    conflict: (low, high) => `Different rent payment habits: ${low} vs ${high}`,
  },
  {
    code: "guests",
    factor: "guests",
    topic: "guests",
    same: (_value, descriptor) =>
      `Similar on having guests over: ${descriptor}`,
    conflict: (low, high) => `Different views on guests: ${low} vs ${high}`,
  },
  {
    code: "overnight_guests",
    factor: "guests",
    topic: "overnight guests",
    same: (_value, descriptor) =>
      `Same view on overnight guests: ${descriptor}`,
    conflict: (low, high) =>
      `Different views on overnight guests: ${low} vs ${high}`,
  },
];

function ordinalInsight(
  rule: OrdinalRule,
  a: RoommateCard,
  b: RoommateCard,
): Insight | null {
  const x = getAnswer(a, rule.code);
  const y = getAnswer(b, rule.code);
  if (x === null || y === null) return null;
  const points = optionCount(rule.code);
  const agreement = ordinalCloseness(x, y, points);
  const base = { factor: rule.factor, topic: rule.topic, agreement };
  const low = describeAnswer(rule.code, Math.min(x, y));
  const high = describeAnswer(rule.code, Math.max(x, y));

  if (x === y) {
    const text = rule.same(x, low);
    return text === null ? null : { ...base, kind: "shared", text };
  }
  if (rule.close && points === 5 && Math.abs(x - y) === 1) {
    return { ...base, kind: "shared", text: rule.close(low, high) };
  }
  if (rule.conflict && agreement <= 0.25) {
    return { ...base, kind: "conflict", text: rule.conflict(low, high) };
  }
  return null;
}

function budgetInsight(a: RoommateCard, b: RoommateCard): Insight | null {
  const score = scoreBudget(a, b);
  const x = budgetRange(a);
  const y = budgetRange(b);
  if (score === null || x === null || y === null) return null;
  const base = { factor: "budget" as const, topic: "budget", agreement: score };
  const low = Math.max(x.min, y.min);
  const high = Math.min(x.max, y.max);
  if (low <= high) {
    return {
      ...base,
      kind: "shared",
      text:
        low === high
          ? `Budgets meet at ${formatINR(low)}`
          : `Budgets overlap ${formatINRRange(low, high)}`,
    };
  }
  if (score <= CONFLICT_THRESHOLD) {
    // Here `high` is the lower maximum and `low` the higher minimum.
    return {
      ...base,
      kind: "conflict",
      text: `Budgets are far apart: up to ${formatINR(high)} vs from ${formatINR(low)}`,
    };
  }
  return null;
}

function foodInsight(a: RoommateCard, b: RoommateCard): Insight | null {
  const score = scoreFood(a, b);
  const x = getAnswer(a, "food_habit");
  const y = getAnswer(b, "food_habit");
  if (score === null || x === null || y === null) return null;
  const base = { factor: "food" as const, topic: "food", agreement: score };
  if (x === y) {
    return {
      ...base,
      kind: "shared",
      text: `Both ${describeAnswer("food_habit", x)}`,
    };
  }
  const [first, second] = x < y ? [a, b] : [b, a];
  const describe = (card: RoommateCard, withKitchen: boolean): string => {
    const habit = describeAnswer(
      "food_habit",
      getAnswer(card, "food_habit") as number,
    );
    return withKitchen && getAnswer(card, "kitchen_preference") === 1
      ? `${habit} (veg-only kitchen)`
      : habit;
  };
  if (score <= CONFLICT_THRESHOLD) {
    return {
      ...base,
      kind: "conflict",
      text: `Different food preferences: ${describe(first, true)} vs ${describe(second, true)}`,
    };
  }
  // Different habits are only called compatible when both people have said
  // what they accept in the kitchen; otherwise the comfort is an assumption.
  if (
    score >= 0.75 &&
    getAnswer(a, "kitchen_preference") !== null &&
    getAnswer(b, "kitchen_preference") !== null
  ) {
    return {
      ...base,
      kind: "shared",
      text: `Compatible food habits: ${describe(first, false)} and ${describe(second, false)}`,
    };
  }
  return null;
}

function matrixInsight(
  code: "schedule" | "chores",
  factor: Factor,
  topic: string,
  matrix: Readonly<Record<string, number>>,
  sameText: (descriptor: string) => string,
  conflictText: (low: string, high: string) => string,
  a: RoommateCard,
  b: RoommateCard,
): Insight | null {
  const x = getAnswer(a, code);
  const y = getAnswer(b, code);
  if (x === null || y === null) return null;
  const low = Math.min(x, y);
  const high = Math.max(x, y);
  const agreement = matrixScore(matrix, low, high);
  const base = { factor, topic, agreement };
  if (x === y) {
    return {
      ...base,
      kind: "shared",
      text: sameText(describeAnswer(code, x)),
    };
  }
  if (agreement <= CONFLICT_THRESHOLD) {
    return {
      ...base,
      kind: "conflict",
      text: conflictText(describeAnswer(code, low), describeAnswer(code, high)),
    };
  }
  return null;
}

const PETS_SHARED: Readonly<Record<string, string>> = {
  "1-1": "Both have pets",
  "1-2": "Both happy around pets",
  "2-2": "Both love pets",
  "3-3": "Both prefer a pet-free home",
  "3-4": "Both prefer a pet-free home",
  "4-4": "Both prefer a pet-free home",
};

function petsInsight(a: RoommateCard, b: RoommateCard): Insight | null {
  const x = getAnswer(a, "pets");
  const y = getAnswer(b, "pets");
  if (x === null || y === null) return null;
  const low = Math.min(x, y);
  const high = Math.max(x, y);
  const key = `${low}-${high}`;
  const agreement = matrixScore(PETS_MATRIX, low, high);
  const base = { factor: "lifestyle" as const, topic: "pets", agreement };
  const sharedText = PETS_SHARED[key];
  if (sharedText !== undefined) {
    return { ...base, kind: "shared", text: sharedText };
  }
  if (agreement <= CONFLICT_THRESHOLD) {
    return {
      ...base,
      kind: "conflict",
      text: `Pets could be an issue: ${describeAnswer("pets", low)} vs ${describeAnswer("pets", high)}`,
    };
  }
  return null;
}

/** key -> display name (whitespace-cleaned, first occurrence). */
function localityNames(card: RoommateCard): Map<string, string> {
  const names = new Map<string, string>();
  for (const value of card.preferred_localities ?? []) {
    if (typeof value !== "string") continue;
    const key = normaliseLocality(value);
    if (key !== "" && !names.has(key)) {
      names.set(key, value.trim().replace(/\s+/g, " "));
    }
  }
  return names;
}

function locationInsight(a: RoommateCard, b: RoommateCard): Insight | null {
  const keysA = localityKeys(a);
  const keysB = new Set(localityKeys(b));
  if (keysA.length === 0 || keysB.size === 0) return null;
  const agreement = scoreLocation(a, b);
  if (agreement === 0) return null; // different cities: handled upstream
  const base = { factor: "location" as const, topic: "location", agreement };
  const shared = keysA.filter((key) => keysB.has(key)).sort();
  if (shared.length === 0) {
    return {
      ...base,
      kind: "conflict",
      text: "No preferred localities in common",
    };
  }
  const namesA = localityNames(a);
  const namesB = localityNames(b);
  const names = shared.map((key) => {
    const fromA = namesA.get(key) as string;
    const fromB = namesB.get(key) as string;
    return fromA < fromB ? fromA : fromB;
  });
  const shown = names.slice(0, 2);
  const more = names.length - shown.length;
  const list =
    more > 0 ? `${shown.join(", ")} and ${more} more` : shown.join(" and ");
  return { ...base, kind: "shared", text: `Both looking in ${list}` };
}

/** Every insight the two cards support, in a fixed order. */
export function collectInsights(a: RoommateCard, b: RoommateCard): Insight[] {
  const insights: (Insight | null)[] = [
    budgetInsight(a, b),
    ...ORDINAL_RULES.slice(0, 2).map((rule) => ordinalInsight(rule, a, b)),
    foodInsight(a, b),
    ...ORDINAL_RULES.slice(2, 4).map((rule) => ordinalInsight(rule, a, b)),
    matrixInsight(
      "schedule",
      "schedule",
      "daily schedule",
      SCHEDULE_MATRIX,
      (descriptor) => `Same daily schedule: ${descriptor}`,
      (low, high) => `Different daily schedules: ${low} vs ${high}`,
      a,
      b,
    ),
    ...ORDINAL_RULES.slice(4).map((rule) => ordinalInsight(rule, a, b)),
    petsInsight(a, b),
    matrixInsight(
      "chores",
      "lifestyle",
      "chores",
      CHORES_MATRIX,
      (descriptor) => `Same approach to chores: ${descriptor}`,
      (low, high) => `Different approaches to chores: ${low} vs ${high}`,
      a,
      b,
    ),
    locationInsight(a, b),
  ];
  return insights.filter((insight): insight is Insight => insight !== null);
}

/**
 * Picks what to show. Shared: strongest agreement first; conflicts: weakest
 * agreement first. Ties go to the factor with the larger weight, then to the
 * fixed order of `collectInsights`.
 */
export function selectInsights(
  insights: readonly Insight[],
  weights: CompatibilityWeights,
): { shared: Insight[]; conflicts: Insight[] } {
  const indexed = insights.map((insight, index) => ({ insight, index }));
  const pick = (kind: Insight["kind"], direction: 1 | -1, limit: number) =>
    indexed
      .filter(({ insight }) => insight.kind === kind)
      .sort(
        (x, y) =>
          direction * (x.insight.agreement - y.insight.agreement) ||
          weights[y.insight.factor] - weights[x.insight.factor] ||
          x.index - y.index,
      )
      .slice(0, limit)
      .map(({ insight }) => insight);
  return {
    shared: pick("shared", -1, MAX_SHARED),
    conflicts: pick("conflict", 1, MAX_CONFLICTS),
  };
}
