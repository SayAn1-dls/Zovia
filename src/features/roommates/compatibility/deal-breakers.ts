import { describeAnswer, getAnswer, type QuestionCode } from "./questions";
import {
  DEAL_BREAKER_CODES,
  type DealBreakerCheck,
  type DealBreakerCode,
  type HardFilterFailure,
  type HardFilterUnknown,
  type RoommateCard,
  type Side,
} from "./types";

/**
 * Deal-breaker code -> the OTHER person's answer that violates it.
 *
 * | code             | question         | violated when the other person answered            |
 * | ---------------- | ---------------- | -------------------------------------------------- |
 * | smoking          | smoking          | 2 (occasionally, outside only) or 3 (regularly)    |
 * | drinking         | drinking         | 3 (regularly)                                      |
 * | non_veg          | food_habit       | 3 (non-vegetarian)                                 |
 * | pets             | pets             | 1 (has a pet)                                      |
 * | overnight_guests | overnight_guests | 3 (fine)                                           |
 * | loud_music       | noise            | 4 (music often) or 5 (music out loud)              |
 * | messy            | cleanliness      | 1 (very relaxed) or 2 (relaxed)                    |
 * | late_rent        | rent_payment     | 3 (sometimes late)                                 |
 *
 * Deliberate asymmetries: any smoking violates "smoking" (smoke and smell
 * reach a non-smoker even from "outside only"), while only regular drinking
 * violates "drinking" (social drinking mostly happens outside the home).
 * Eggetarian (2) does not violate "non_veg": the code is about meat and fish;
 * egg tolerance is scored by the food factor through kitchen_preference.
 * "Occasionally with notice" (2) does not violate "overnight_guests".
 */
export const DEAL_BREAKER_RULES: Readonly<
  Record<
    DealBreakerCode,
    { question: QuestionCode; violating: readonly number[] }
  >
> = {
  smoking: { question: "smoking", violating: [2, 3] },
  drinking: { question: "drinking", violating: [3] },
  non_veg: { question: "food_habit", violating: [3] },
  pets: { question: "pets", violating: [1] },
  overnight_guests: { question: "overnight_guests", violating: [3] },
  loud_music: { question: "noise", violating: [4, 5] },
  messy: { question: "cleanliness", violating: [1, 2] },
  late_rent: { question: "rent_payment", violating: [3] },
};

function isDealBreakerCode(code: string): code is DealBreakerCode {
  return (DEAL_BREAKER_CODES as readonly string[]).includes(code);
}

function isAge(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Rules stated by `holder`, evaluated against `other`. */
function checkOneSide(
  holder: RoommateCard,
  other: RoommateCard,
  side: Side,
  failures: HardFilterFailure[],
  unknown: HardFilterUnknown[],
): void {
  const base = { side, holder_id: holder.user_id, violator_id: other.user_id };

  const seen = new Set<string>();
  for (const code of holder.deal_breakers ?? []) {
    if (seen.has(code)) continue;
    seen.add(code);
    if (!isDealBreakerCode(code)) {
      unknown.push({ rule: code, side, reason: "unrecognised_code" });
      continue;
    }
    const rule = DEAL_BREAKER_RULES[code];
    const answer = getAnswer(other, rule.question);
    if (answer === null) {
      unknown.push({ rule: code, side, reason: "unanswered" });
    } else if (rule.violating.includes(answer)) {
      failures.push({
        ...base,
        kind: "deal_breaker",
        rule: code,
        detail: `"${code}" is a deal-breaker and the other person answered ${rule.question} = ${answer} (${describeAnswer(rule.question, answer)})`,
      });
    }
  }

  const preferences = holder.preferences;
  if (!preferences) return;

  const genders = preferences.preferred_genders ?? [];
  if (genders.length > 0) {
    if (other.gender === null || other.gender === undefined) {
      unknown.push({ rule: "preferred_gender", side, reason: "unanswered" });
    } else if (!genders.includes(other.gender)) {
      failures.push({
        ...base,
        kind: "preference",
        rule: "preferred_gender",
        detail: `prefers ${genders.join(" or ")} and the other person is ${other.gender}`,
      });
    }
  }

  const min = isAge(preferences.age_min) ? preferences.age_min : null;
  const max = isAge(preferences.age_max) ? preferences.age_max : null;
  if (min !== null || max !== null) {
    if (!isAge(other.age)) {
      unknown.push({ rule: "age_range", side, reason: "unanswered" });
    } else if (
      (min !== null && other.age < min) ||
      (max !== null && other.age > max)
    ) {
      failures.push({
        ...base,
        kind: "preference",
        rule: "age_range",
        detail: `prefers age ${min ?? "any"} to ${max ?? "any"} and the other person is ${other.age}`,
      });
    }
  }
}

/**
 * Hard filter applied before any scoring. A pair passes only when neither
 * person's deal-breakers or stated preferences (gender, age range, both
 * bounds inclusive) are violated by the other. Symmetric: swapping the
 * arguments yields the same verdict with `side` mirrored.
 *
 * An unanswered question, an unknown gender or age, or an unrecognised
 * deal-breaker code never excludes anyone; each is listed in `unknown`.
 * `occupation_prefs` is not a hard filter.
 */
export function checkDealBreakers(
  a: RoommateCard,
  b: RoommateCard,
): DealBreakerCheck {
  const failures: HardFilterFailure[] = [];
  const unknown: HardFilterUnknown[] = [];
  checkOneSide(a, b, "a", failures, unknown);
  checkOneSide(b, a, "b", failures, unknown);
  return { passed: failures.length === 0, failures, unknown };
}
