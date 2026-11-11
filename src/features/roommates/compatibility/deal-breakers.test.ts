import { describe, expect, it } from "vitest";

import { checkDealBreakers, DEAL_BREAKER_RULES } from "./deal-breakers";
import { emptyCard, fullCard, withAnswers } from "./fixtures";
import { optionCount } from "./questions";
import { DEAL_BREAKER_CODES, type DealBreakerCode } from "./types";

const holder = (code: string) =>
  emptyCard({ user_id: "holder", deal_breakers: [code] });
const other = (answers: Record<string, number>) =>
  emptyCard({ user_id: "other", answers });

describe("deal-breaker mapping", () => {
  it("defines a rule for every deal-breaker code", () => {
    expect(Object.keys(DEAL_BREAKER_RULES).sort()).toEqual(
      [...DEAL_BREAKER_CODES].sort(),
    );
  });

  it("matches the documented table", () => {
    expect(DEAL_BREAKER_RULES).toEqual({
      smoking: { question: "smoking", violating: [2, 3] },
      drinking: { question: "drinking", violating: [3] },
      non_veg: { question: "food_habit", violating: [3] },
      pets: { question: "pets", violating: [1] },
      overnight_guests: { question: "overnight_guests", violating: [3] },
      loud_music: { question: "noise", violating: [4, 5] },
      messy: { question: "cleanliness", violating: [1, 2] },
      late_rent: { question: "rent_payment", violating: [3] },
    });
  });

  // Every option value of every rule's question, in both directions.
  const cases = DEAL_BREAKER_CODES.flatMap((code) => {
    const rule = DEAL_BREAKER_RULES[code];
    return Array.from({ length: optionCount(rule.question) }, (_, i) => ({
      code,
      question: rule.question,
      value: i + 1,
      violates: rule.violating.includes(i + 1),
    }));
  });

  it.each(cases)(
    "$code vs $question = $value -> violated: $violates",
    ({ code, question, value, violates }) => {
      const a = holder(code);
      const b = other({ [question]: value });

      const forward = checkDealBreakers(a, b);
      expect(forward.passed).toBe(!violates);
      expect(forward.unknown).toEqual([]);
      if (violates) {
        expect(forward.failures).toHaveLength(1);
        expect(forward.failures[0]).toMatchObject({
          kind: "deal_breaker",
          rule: code,
          side: "a",
          holder_id: "holder",
          violator_id: "other",
        });
        expect(forward.failures[0]?.detail).toContain(`${question} = ${value}`);
      } else {
        expect(forward.failures).toEqual([]);
      }

      const reverse = checkDealBreakers(b, a);
      expect(reverse.passed).toBe(!violates);
      if (violates) {
        expect(reverse.failures[0]).toMatchObject({
          rule: code,
          side: "b",
          holder_id: "holder",
          violator_id: "other",
        });
      }
    },
  );

  it.each(DEAL_BREAKER_CODES)(
    "%s is unknown, not violated, when the other person has not answered",
    (code: DealBreakerCode) => {
      const forward = checkDealBreakers(holder(code), other({}));
      expect(forward.passed).toBe(true);
      expect(forward.failures).toEqual([]);
      expect(forward.unknown).toEqual([
        { rule: code, side: "a", reason: "unanswered" },
      ]);
      const reverse = checkDealBreakers(other({}), holder(code));
      expect(reverse.passed).toBe(true);
      expect(reverse.unknown).toEqual([
        { rule: code, side: "b", reason: "unanswered" },
      ]);
    },
  );

  it("treats an out-of-range answer as unanswered", () => {
    const result = checkDealBreakers(holder("smoking"), other({ smoking: 9 }));
    expect(result.passed).toBe(true);
    expect(result.unknown).toEqual([
      { rule: "smoking", side: "a", reason: "unanswered" },
    ]);
  });

  it("does not apply a person's deal-breaker to their own answers", () => {
    const smokerWhoObjects = emptyCard({
      user_id: "holder",
      deal_breakers: ["smoking"],
      answers: { smoking: 3 },
    });
    expect(
      checkDealBreakers(smokerWhoObjects, other({ smoking: 1 })).passed,
    ).toBe(true);
  });

  it("reports an unrecognised code without excluding anyone", () => {
    const result = checkDealBreakers(
      holder("vaping"),
      other({ smoking: 3, drinking: 3 }),
    );
    expect(result.passed).toBe(true);
    expect(result.unknown).toEqual([
      { rule: "vaping", side: "a", reason: "unrecognised_code" },
    ]);
  });

  it("reports a duplicated code once", () => {
    const a = emptyCard({
      user_id: "holder",
      deal_breakers: ["smoking", "smoking"],
    });
    expect(checkDealBreakers(a, other({ smoking: 3 })).failures).toHaveLength(
      1,
    );
  });

  it("collects failures from both sides", () => {
    const a = emptyCard({
      user_id: "a",
      deal_breakers: ["smoking", "messy"],
      answers: { pets: 1 },
    });
    const b = emptyCard({
      user_id: "b",
      deal_breakers: ["pets", "late_rent"],
      answers: { smoking: 3, cleanliness: 4 },
    });
    const result = checkDealBreakers(a, b);
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => [f.rule, f.side])).toEqual([
      ["smoking", "a"],
      ["pets", "b"],
    ]);
    expect(result.unknown).toEqual([
      { rule: "late_rent", side: "b", reason: "unanswered" },
    ]);
  });

  it("passes two people with no rules at all", () => {
    expect(checkDealBreakers(fullCard(), fullCard({ user_id: "b" }))).toEqual({
      passed: true,
      failures: [],
      unknown: [],
    });
  });

  it("passes identical full profiles that hold every deal-breaker they satisfy", () => {
    const a = fullCard({ deal_breakers: [...DEAL_BREAKER_CODES] });
    const b = fullCard({
      user_id: "b",
      deal_breakers: [...DEAL_BREAKER_CODES],
    });
    expect(checkDealBreakers(a, b).passed).toBe(true);
  });
});

describe("preference filters", () => {
  const prefs = (
    overrides: Partial<
      NonNullable<ReturnType<typeof emptyCard>["preferences"]>
    >,
  ) => ({
    preferred_genders: [],
    age_min: null,
    age_max: null,
    occupation_prefs: [],
    ...overrides,
  });

  it("fails when the other person's gender is not preferred, from either side", () => {
    const a = emptyCard({
      user_id: "a",
      gender: "female",
      preferences: prefs({ preferred_genders: ["female"] }),
    });
    const b = emptyCard({ user_id: "b", gender: "male" });
    const forward = checkDealBreakers(a, b);
    expect(forward.passed).toBe(false);
    expect(forward.failures).toEqual([
      {
        kind: "preference",
        rule: "preferred_gender",
        side: "a",
        holder_id: "a",
        violator_id: "b",
        detail: "prefers female and the other person is male",
      },
    ]);
    const reverse = checkDealBreakers(b, a);
    expect(reverse.passed).toBe(false);
    expect(reverse.failures[0]).toMatchObject({ side: "b", holder_id: "a" });
  });

  it("passes when the gender is one of several preferred", () => {
    const a = emptyCard({
      preferences: prefs({ preferred_genders: ["female", "non_binary"] }),
    });
    expect(
      checkDealBreakers(a, emptyCard({ user_id: "b", gender: "non_binary" }))
        .passed,
    ).toBe(true);
  });

  it("requires the preference to hold in both directions", () => {
    const a = emptyCard({
      user_id: "a",
      gender: "female",
      preferences: prefs({ preferred_genders: ["male"] }),
    });
    const b = emptyCard({
      user_id: "b",
      gender: "male",
      preferences: prefs({ preferred_genders: ["male"] }),
    });
    const result = checkDealBreakers(a, b);
    expect(result.passed).toBe(false);
    expect(result.failures.map((f) => f.side)).toEqual(["b"]);
  });

  it("fails 'prefer not to say' against an explicit gender preference", () => {
    const a = emptyCard({
      preferences: prefs({ preferred_genders: ["female"] }),
    });
    const b = emptyCard({ user_id: "b", gender: "prefer_not_to_say" });
    expect(checkDealBreakers(a, b).passed).toBe(false);
  });

  it("treats an unknown gender as unknown, not as a failure", () => {
    const a = emptyCard({
      preferences: prefs({ preferred_genders: ["female"] }),
    });
    const result = checkDealBreakers(a, emptyCard({ user_id: "b" }));
    expect(result.passed).toBe(true);
    expect(result.unknown).toEqual([
      { rule: "preferred_gender", side: "a", reason: "unanswered" },
    ]);
  });

  it.each([[null], [[]]])(
    "has no gender preference when the list is %j",
    (list) => {
      const a = emptyCard({
        preferences: prefs({ preferred_genders: list as never }),
      });
      const result = checkDealBreakers(
        a,
        emptyCard({ user_id: "b", gender: "male" }),
      );
      expect(result).toEqual({ passed: true, failures: [], unknown: [] });
    },
  );

  it.each([
    [22, 30, 21, false],
    [22, 30, 22, true],
    [22, 30, 26, true],
    [22, 30, 30, true],
    [22, 30, 31, false],
    [null, 30, 18, true],
    [null, 30, 31, false],
    [25, null, 24, false],
    [25, null, 60, true],
    [null, null, 99, true],
  ])("age range %s..%s vs age %i -> passes: %s", (min, max, age, passes) => {
    const a = emptyCard({
      user_id: "a",
      preferences: prefs({ age_min: min, age_max: max }),
    });
    const b = emptyCard({ user_id: "b", age });
    expect(checkDealBreakers(a, b).passed).toBe(passes);
    const reverse = checkDealBreakers(b, a);
    expect(reverse.passed).toBe(passes);
    if (!passes) {
      expect(reverse.failures[0]).toMatchObject({
        kind: "preference",
        rule: "age_range",
        side: "b",
      });
    }
  });

  it("treats an unknown age as unknown, not as a failure", () => {
    const a = emptyCard({ preferences: prefs({ age_min: 20, age_max: 30 }) });
    const result = checkDealBreakers(a, emptyCard({ user_id: "b" }));
    expect(result.passed).toBe(true);
    expect(result.unknown).toEqual([
      { rule: "age_range", side: "a", reason: "unanswered" },
    ]);
  });

  it("does not treat occupation preferences as a hard filter", () => {
    const a = emptyCard({
      preferences: prefs({ occupation_prefs: ["student"] }),
    });
    const b = emptyCard({ user_id: "b", occupation: "working_professional" });
    expect(checkDealBreakers(a, b).passed).toBe(true);
  });

  it("combines deal-breakers and preferences", () => {
    const a = withAnswers(
      fullCard({
        user_id: "a",
        deal_breakers: ["loud_music"],
        preferences: prefs({ preferred_genders: ["female"], age_max: 30 }),
      }),
      {},
    );
    const b = withAnswers(fullCard({ user_id: "b", gender: "male", age: 35 }), {
      noise: 5,
    });
    expect(checkDealBreakers(a, b).failures.map((f) => f.rule)).toEqual([
      "loud_music",
      "preferred_gender",
      "age_range",
    ]);
  });
});
