import { describe, expect, it } from "vitest";

import {
  emptyCard,
  fullCard,
  randomCard,
  seededRandom,
  withAnswers,
} from "./fixtures";
import {
  ALGORITHM_VERSION,
  checkDealBreakers,
  collectInsights,
  computeCompatibility,
  DEAL_BREAKER_CODES,
  DEFAULT_WEIGHTS,
  FACTORS,
  getAnswer,
  optionCount,
  rankCandidates,
  validateWeights,
  type CompatibilityWeights,
  type QuestionCode,
  type RoommateCard,
} from "./index";

const ORDINAL_CODES: QuestionCode[] = [
  "sleep_schedule",
  "cleanliness",
  "social_level",
  "noise",
  "cooking",
  "personal_space",
  "guests",
  "smoking",
  "drinking",
  "rent_payment",
  "overnight_guests",
];

const weightsWith = (
  overrides: Partial<CompatibilityWeights>,
): CompatibilityWeights => ({ ...DEFAULT_WEIGHTS, ...overrides });

describe("weights", () => {
  it("default weights match the spec and sum to 1", () => {
    expect(DEFAULT_WEIGHTS).toEqual({
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
    const sum = FACTORS.reduce((total, f) => total + DEFAULT_WEIGHTS[f], 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(validateWeights(DEFAULT_WEIGHTS)).toEqual({
      valid: true,
      errors: [],
    });
    expect(Object.isFrozen(DEFAULT_WEIGHTS)).toBe(true);
  });

  it("accepts a sum within 0.001 of 1 and rejects one outside it", () => {
    expect(validateWeights(weightsWith({ budget: 0.2009 })).valid).toBe(true);
    expect(validateWeights(weightsWith({ budget: 0.1991 })).valid).toBe(true);
    const over = validateWeights(weightsWith({ budget: 0.2011 }));
    expect(over.valid).toBe(false);
    expect(over.errors).toEqual(["weights must sum to 1 (got 1.0011)"]);
    expect(validateWeights(weightsWith({ budget: 0.19 })).valid).toBe(false);
  });

  it("requires every factor", () => {
    const partial: Record<string, number> = { ...DEFAULT_WEIGHTS };
    delete partial.guests;
    expect(validateWeights(partial)).toEqual({
      valid: false,
      errors: ['missing weight for "guests"'],
    });
  });

  it.each([
    [-0.1, 'weight for "budget" must be between 0 and 1'],
    [1.1, 'weight for "budget" must be between 0 and 1'],
    [Number.NaN, 'weight for "budget" must be a number'],
    [Number.POSITIVE_INFINITY, 'weight for "budget" must be a number'],
    ["0.2", 'weight for "budget" must be a number'],
    [null, 'weight for "budget" must be a number'],
  ])("rejects a budget weight of %s", (value, message) => {
    const result = validateWeights({ ...DEFAULT_WEIGHTS, budget: value });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([message]);
  });

  it("rejects unknown factors and non-objects", () => {
    expect(validateWeights({ ...DEFAULT_WEIGHTS, vibes: 0 }).errors).toEqual([
      'unknown factor "vibes"',
    ]);
    for (const value of [null, undefined, 1, "x", [0.5, 0.5]]) {
      expect(validateWeights(value)).toEqual({
        valid: false,
        errors: ["weights must be an object keyed by factor"],
      });
    }
  });

  it("accepts all the weight on one factor", () => {
    const single = Object.fromEntries(
      FACTORS.map((f) => [f, f === "budget" ? 1 : 0]),
    );
    expect(validateWeights(single).valid).toBe(true);
  });
});

describe("computeCompatibility: identical and complete profiles", () => {
  const a = fullCard();
  const b = fullCard({ user_id: "b" });
  const result = computeCompatibility(a, b, DEFAULT_WEIGHTS);

  it("scores 100 with high confidence", () => {
    expect(result.score).toBe(100);
    expect(result.raw_score).toBeCloseTo(1, 12);
    expect(result.confidence).toBe("high");
    expect(result.insufficient_data).toBe(false);
    expect(result.factors_scored).toBe(9);
    expect(result.answers_compared).toBe(16);
    expect(result.algorithm_version).toBe(ALGORITHM_VERSION);
    expect(result.conflicts).toEqual([]);
  });

  it("reports every factor at 1 with its configured weight", () => {
    for (const factor of FACTORS) {
      expect(result.breakdown[factor].score).toBe(1);
      expect(result.breakdown[factor].weight).toBe(DEFAULT_WEIGHTS[factor]);
      expect(result.breakdown[factor].effective_weight).toBeCloseTo(
        DEFAULT_WEIGHTS[factor],
        12,
      );
    }
  });

  it("lists the five strongest agreements, heaviest factors first", () => {
    expect(result.shared).toEqual([
      "Budgets overlap ₹8,000–₹12,000",
      "Both keep things spotless",
      "Similar sleep schedule: before midnight",
      "Both vegetarian",
      "Neither smokes",
    ]);
    expect(result.explanation).toBe(
      "Strong match: you two line up on budget, cleanliness and sleep schedule.",
    );
  });

  it("uses default weights when none are passed", () => {
    expect(computeCompatibility(a, b)).toEqual(result);
  });

  it("scores 100 for identical generated profiles that state localities", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const card = randomCard(random, `x${i}`);
      const twin = { ...card, user_id: `y${i}` };
      const expected =
        (card.preferred_localities ?? []).length > 0 ? 100 : null;
      const score = computeCompatibility(card, twin).score;
      if (expected !== null) expect(score).toBe(100);
      // Without localities the location factor is a neutral 0.5.
      else expect(score).toBeGreaterThanOrEqual(87);
    }
  });
});

describe("computeCompatibility: properties over generated pairs", () => {
  it("is symmetric: (a, b) deeply equals (b, a)", () => {
    const random = seededRandom(20261111);
    for (let i = 0; i < 500; i += 1) {
      const a = randomCard(random, `a${i}`);
      const b = randomCard(random, `b${i}`);
      expect(computeCompatibility(a, b)).toEqual(computeCompatibility(b, a));
    }
  });

  it("is symmetric under custom weights", () => {
    const random = seededRandom(99);
    const weights = weightsWith({ budget: 0.05, cleanliness: 0.3 });
    for (let i = 0; i < 200; i += 1) {
      const a = randomCard(random, `a${i}`);
      const b = randomCard(random, `b${i}`);
      expect(computeCompatibility(a, b, weights)).toEqual(
        computeCompatibility(b, a, weights),
      );
    }
  });

  it("is deterministic", () => {
    const first = randomCard(seededRandom(5), "a");
    const second = randomCard(seededRandom(6), "b");
    expect(computeCompatibility(first, second)).toEqual(
      computeCompatibility(first, second),
    );
    expect(randomCard(seededRandom(5), "a")).toEqual(first);
  });

  it("keeps scores in range, rounded, and consistent with the breakdown", () => {
    const random = seededRandom(31337);
    for (let i = 0; i < 500; i += 1) {
      const result = computeCompatibility(
        randomCard(random, "a"),
        randomCard(random, "b"),
      );
      expect(Number.isInteger(result.score)).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(result.score).toBe(Math.round(result.raw_score * 100));
      let contributions = 0;
      let effective = 0;
      let scored = 0;
      for (const factor of FACTORS) {
        const part = result.breakdown[factor];
        contributions += part.contribution;
        effective += part.effective_weight;
        if (part.score !== null) scored += 1;
        else expect(part.effective_weight).toBe(0);
      }
      expect(contributions).toBeCloseTo(result.raw_score, 10);
      expect(effective).toBeCloseTo(1, 10);
      expect(scored).toBe(result.factors_scored);
      expect(result.shared.length).toBeLessThanOrEqual(5);
      expect(result.conflicts.length).toBeLessThanOrEqual(4);
      expect(result.explanation).toMatch(/\.$/);
    }
  });

  it("is monotonic: moving one answer a step closer never lowers the score", () => {
    const random = seededRandom(424242);
    let steps = 0;
    for (let i = 0; i < 300; i += 1) {
      const a = randomCard(random, "a");
      const b = randomCard(random, "b");
      for (const code of ORDINAL_CODES) {
        const target = getAnswer(b, code);
        let current = getAnswer(a, code);
        if (target === null || current === null) continue;
        let card = a;
        let previous = computeCompatibility(card, b).raw_score;
        while (current !== target) {
          current += current < target ? 1 : -1;
          card = withAnswers(card, { [code]: current });
          const next = computeCompatibility(card, b).raw_score;
          expect(next).toBeGreaterThanOrEqual(previous - 1e-12);
          previous = next;
          steps += 1;
        }
      }
    }
    expect(steps).toBeGreaterThan(1000);
  });

  it("is monotonic for every ordinal question from the far end of the scale", () => {
    const b = fullCard({ user_id: "b" });
    for (const code of ORDINAL_CODES) {
      const target = getAnswer(b, code) as number;
      const far = target > optionCount(code) / 2 ? 1 : optionCount(code);
      let previous = -1;
      for (
        let value = far;
        value !== target + (far < target ? 1 : -1);
        value += far < target ? 1 : -1
      ) {
        const raw = computeCompatibility(
          withAnswers(fullCard(), { [code]: value }),
          b,
        ).raw_score;
        expect(raw).toBeGreaterThan(previous);
        previous = raw;
      }
      expect(previous).toBeCloseTo(1, 12);
    }
  });
});

describe("computeCompatibility: weight renormalisation", () => {
  it("renormalises over the factors that produced a score", () => {
    const a = emptyCard({
      budget_min: 8000,
      budget_max: 12000,
      answers: { cleanliness: 5 },
    });
    const b = emptyCard({
      user_id: "b",
      budget_min: 8000,
      budget_max: 12000,
      answers: { cleanliness: 3 },
    });
    const result = computeCompatibility(a, b, DEFAULT_WEIGHTS);
    // budget 1 (0.20), cleanliness 0.5 (0.15), location neutral 0.5 (0.05)
    // -> (0.20 + 0.075 + 0.025) / 0.40 = 0.75
    expect(result.raw_score).toBeCloseTo(0.75, 12);
    expect(result.score).toBe(75);
    expect(result.factors_scored).toBe(3);
    expect(result.answers_compared).toBe(1);
    expect(result.breakdown.budget.effective_weight).toBeCloseTo(0.5, 12);
    expect(result.breakdown.cleanliness.effective_weight).toBeCloseTo(
      0.375,
      12,
    );
    expect(result.breakdown.location.effective_weight).toBeCloseTo(0.125, 12);
    expect(result.breakdown.cleanliness.contribution).toBeCloseTo(0.1875, 12);
    for (const factor of ["sleep", "food", "schedule", "guests"] as const) {
      expect(result.breakdown[factor]).toEqual({
        score: null,
        weight: DEFAULT_WEIGHTS[factor],
        effective_weight: 0,
        contribution: 0,
      });
    }
    expect(result.confidence).toBe("low");
  });

  it("is not dragged down by a factor one person left unanswered", () => {
    const a = fullCard();
    const b = withAnswers(fullCard({ user_id: "b" }), {
      sleep_schedule: undefined,
      cleanliness: undefined,
    });
    const result = computeCompatibility(a, b);
    expect(result.score).toBe(100);
    expect(result.breakdown.sleep.score).toBeNull();
    expect(result.breakdown.cleanliness.score).toBeNull();
    expect(result.factors_scored).toBe(7);
    expect(result.answers_compared).toBe(14);
  });

  it("ignores a factor with zero weight", () => {
    const a = fullCard();
    const b = withAnswers(fullCard({ user_id: "b" }), { cleanliness: 1 });
    const result = computeCompatibility(a, b, weightsWith({ cleanliness: 0 }));
    expect(result.score).toBe(100);
    expect(result.breakdown.cleanliness).toMatchObject({
      score: 0,
      effective_weight: 0,
      contribution: 0,
    });
  });

  it("gives the same result when all weights are scaled", () => {
    const a = randomCard(seededRandom(1), "a");
    const b = randomCard(seededRandom(2), "b");
    const doubled = Object.fromEntries(
      FACTORS.map((f) => [f, DEFAULT_WEIGHTS[f] * 2]),
    ) as CompatibilityWeights;
    expect(computeCompatibility(a, b, doubled).score).toBe(
      computeCompatibility(a, b).score,
    );
  });

  it("scores two empty profiles on neutral location only, with low confidence", () => {
    const result = computeCompatibility(
      emptyCard(),
      emptyCard({ user_id: "b" }),
    );
    expect(result.score).toBe(50);
    expect(result.factors_scored).toBe(1);
    expect(result.confidence).toBe("low");
    expect(result.shared).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.explanation).toBe(
      "Fair match, based on the answers you both gave.",
    );
  });

  it("flags insufficient data when no weighted factor can be scored", () => {
    const result = computeCompatibility(
      emptyCard(),
      emptyCard({ user_id: "b" }),
      weightsWith({ location: 0 }),
    );
    expect(result.insufficient_data).toBe(true);
    expect(result.score).toBe(0);
    expect(result.confidence).toBe("low");
    expect(result.explanation).toBe(
      "There is not enough information on both profiles to estimate compatibility yet.",
    );
  });

  it.each([
    ["negative", { budget: -0.1 }],
    ["not a number", { budget: Number.NaN }],
    ["missing", { budget: undefined as unknown as number }],
  ])("throws when a weight is %s", (_name, overrides) => {
    expect(() =>
      computeCompatibility(fullCard(), fullCard(), weightsWith(overrides)),
    ).toThrow(RangeError);
    expect(() =>
      rankCandidates(fullCard(), [], weightsWith(overrides)),
    ).toThrow(/"budget"/);
  });
});

describe("computeCompatibility: confidence", () => {
  const six = {
    cleanliness: 4,
    sleep_schedule: 2,
    food_habit: 1,
    smoking: 1,
    drinking: 1,
    schedule: 1,
  };
  const withBudget = (id: string, answers: Record<string, number>) =>
    emptyCard({ user_id: id, budget_min: 8000, budget_max: 12000, answers });

  it("is medium with broad factor coverage but few shared answers", () => {
    const result = computeCompatibility(
      withBudget("a", six),
      withBudget("b", six),
    );
    expect(result.answers_compared).toBe(6);
    expect(result.factors_scored).toBe(7);
    expect(result.confidence).toBe("medium");
  });

  it("is low with five shared answers", () => {
    const five = { ...six } as Record<string, number>;
    delete five.schedule;
    expect(
      computeCompatibility(withBudget("a", five), withBudget("b", five))
        .confidence,
    ).toBe("low");
  });

  it("is low when the scored factors carry under half of the weight", () => {
    const lifestyle = {
      social_level: 3,
      noise: 2,
      pets: 2,
      cooking: 3,
      personal_space: 3,
      chores: 1,
      rent_payment: 1,
      guests: 2,
      overnight_guests: 2,
    };
    const result = computeCompatibility(
      emptyCard({ answers: lifestyle }),
      emptyCard({ user_id: "b", answers: lifestyle }),
    );
    expect(result.answers_compared).toBe(9);
    // lifestyle 0.10 + guests 0.05 + location 0.05 = 0.20
    expect(result.confidence).toBe("low");
  });

  it("is high at twelve shared answers and full coverage, medium at eleven", () => {
    const a = fullCard();
    const drop = (codes: string[]) =>
      withAnswers(
        fullCard({ user_id: "b" }),
        Object.fromEntries(codes.map((code) => [code, undefined])),
      );
    const twelve = computeCompatibility(
      a,
      drop(["kitchen_preference", "drinking", "cooking", "chores"]),
    );
    expect(twelve.answers_compared).toBe(12);
    expect(twelve.confidence).toBe("high");
    const eleven = computeCompatibility(
      a,
      drop(["kitchen_preference", "drinking", "cooking", "chores", "noise"]),
    );
    expect(eleven.answers_compared).toBe(11);
    expect(eleven.confidence).toBe("medium");
  });
});

describe("computeCompatibility: shared and conflict phrases", () => {
  const a = fullCard();
  const other = (changes: Record<string, number | undefined>) =>
    withAnswers(fullCard({ user_id: "b" }), changes);

  it("names a conflict the same way from either side", () => {
    const early = withAnswers(fullCard(), { sleep_schedule: 1 });
    const owl = other({ sleep_schedule: 5 });
    const expected = ["Different sleep schedules: early bird vs night owl"];
    expect(computeCompatibility(early, owl).conflicts).toEqual(expected);
    expect(computeCompatibility(owl, early).conflicts).toEqual(expected);
  });

  it("lists at most four conflicts, weakest first, heavier factors first on ties", () => {
    const b = other({
      sleep_schedule: 5, // 0.25
      cleanliness: 1, // 0
      smoking: 3, // 0
      schedule: 2, // 0.2
      guests: 5, // 0.25
      noise: 5, // 0.25
      rent_payment: 3, // 0
    });
    const result = computeCompatibility(a, b);
    expect(result.conflicts).toEqual([
      "Different cleanliness standards: very relaxed vs spotless",
      "Different smoking habits: never vs regularly",
      "Different rent payment habits: always on time vs sometimes late",
      "Different daily schedules: daytime vs night shift",
    ]);
    expect(result.explanation).toMatch(
      / Worth talking through early: cleanliness and smoking\.$/,
    );
    expect(result.explanation.split(". ")).toHaveLength(2);
    expect(computeCompatibility(b, a)).toEqual(result);
  });

  it("caps shared items at five and prefers exact agreement over near agreement", () => {
    const b = other({ cleanliness: 4, sleep_schedule: 3 });
    const result = computeCompatibility(a, b);
    expect(result.shared).toEqual([
      "Budgets overlap ₹8,000–₹12,000",
      "Both vegetarian",
      "Neither smokes",
      "Both drink socially",
      "Same daily schedule: daytime",
    ]);
    const texts = collectInsights(a, b).map((insight) => insight.text);
    expect(texts).toContain(
      "Similar cleanliness standards: clean and spotless",
    );
    expect(texts).toContain(
      "Close sleep schedules: before midnight and around midnight",
    );
  });

  it.each([
    [
      [8000, 12000],
      [10000, 15000],
      "shared",
      "Budgets overlap ₹10,000–₹12,000",
    ],
    [[8000, 10000], [10000, 14000], "shared", "Budgets meet at ₹10,000"],
    [[9000, 9000], [8000, 12000], "shared", "Budgets meet at ₹9,000"],
    [
      [6000, 10000],
      [15000, 20000],
      "conflict",
      "Budgets are far apart: up to ₹10,000 vs from ₹15,000",
    ],
  ] as const)("budget %j vs %j -> %s: %s", (x, y, kind, text) => {
    const first = emptyCard({ budget_min: x[0], budget_max: x[1] });
    const second = emptyCard({
      user_id: "b",
      budget_min: y[0],
      budget_max: y[1],
    });
    for (const result of [
      computeCompatibility(first, second),
      computeCompatibility(second, first),
    ]) {
      expect(kind === "shared" ? result.shared : result.conflicts).toEqual([
        text,
      ]);
      expect(kind === "shared" ? result.conflicts : result.shared).toEqual([]);
    }
  });

  it("says nothing about a moderate budget gap", () => {
    const result = computeCompatibility(
      emptyCard({ budget_min: 6000, budget_max: 10000 }),
      emptyCard({ user_id: "b", budget_min: 12500, budget_max: 15000 }),
    );
    expect(result.breakdown.budget.score).toBeCloseTo(0.375, 12);
    expect(result.shared).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it.each([
    [{ food_habit: 1 }, { food_habit: 1 }, "shared", "Both vegetarian"],
    [{ food_habit: 3 }, { food_habit: 3 }, "shared", "Both non-vegetarian"],
    [
      { food_habit: 1, kitchen_preference: 1 },
      { food_habit: 3, kitchen_preference: 3 },
      "conflict",
      "Different food preferences: vegetarian (veg-only kitchen) vs non-vegetarian",
    ],
    [
      { food_habit: 1, kitchen_preference: 3 },
      { food_habit: 4, kitchen_preference: 1 },
      "shared",
      "Compatible food habits: vegetarian and vegan",
    ],
    [
      { pets: 1 },
      { pets: 4 },
      "conflict",
      "Pets could be an issue: has a pet vs allergic to pets",
    ],
    [
      { pets: 1 },
      { pets: 3 },
      "conflict",
      "Pets could be an issue: has a pet vs prefers no pets",
    ],
    [{ pets: 3 }, { pets: 4 }, "shared", "Both prefer a pet-free home"],
    [{ pets: 1 }, { pets: 2 }, "shared", "Both happy around pets"],
    [
      { cleanliness: 5 },
      { cleanliness: 5 },
      "shared",
      "Both keep things spotless",
    ],
    [
      { cleanliness: 2 },
      { cleanliness: 2 },
      "shared",
      "Both relaxed about tidiness",
    ],
    [{ smoking: 1 }, { smoking: 1 }, "shared", "Neither smokes"],
    [
      { drinking: 1 },
      { drinking: 3 },
      "conflict",
      "Different drinking habits: never vs regularly",
    ],
    [
      { schedule: 1 },
      { schedule: 2 },
      "conflict",
      "Different daily schedules: daytime vs night shift",
    ],
    [
      { schedule: 4 },
      { schedule: 4 },
      "shared",
      "Same daily schedule: working or studying from home",
    ],
    [
      { chores: 1 },
      { chores: 3 },
      "conflict",
      "Different approaches to chores: split with a schedule vs everyone handles their own mess",
    ],
    [
      { chores: 2 },
      { chores: 2 },
      "shared",
      "Same approach to chores: hire help and split the cost",
    ],
    [
      { social_level: 1 },
      { social_level: 5 },
      "conflict",
      "Different social styles: keeps to themselves vs very social",
    ],
    [
      { noise: 1 },
      { noise: 4 },
      "conflict",
      "Different noise levels: needs quiet vs music often",
    ],
    [
      { personal_space: 2 },
      { personal_space: 2 },
      "shared",
      "Similar need for personal space: private",
    ],
    [
      { rent_payment: 1 },
      { rent_payment: 1 },
      "shared",
      "Both pay rent on time",
    ],
    [
      { guests: 1 },
      { guests: 5 },
      "conflict",
      "Different views on guests: never vs very often",
    ],
    [
      { overnight_guests: 1 },
      { overnight_guests: 3 },
      "conflict",
      "Different views on overnight guests: not okay vs fine",
    ],
    [
      { overnight_guests: 2 },
      { overnight_guests: 2 },
      "shared",
      "Same view on overnight guests: occasionally with notice",
    ],
    [{ cooking: 5 }, { cooking: 5 }, "shared", "Both cook daily"],
  ] as const)("%j vs %j -> %s: %s", (x, y, kind, text) => {
    const first = emptyCard({ answers: x });
    const second = emptyCard({ user_id: "b", answers: y });
    for (const result of [
      computeCompatibility(first, second),
      computeCompatibility(second, first),
    ]) {
      expect(kind === "shared" ? result.shared : result.conflicts).toEqual([
        text,
      ]);
      expect(kind === "shared" ? result.conflicts : result.shared).toEqual([]);
    }
  });

  it.each([
    [{ cleanliness: 5 }, { cleanliness: 3 }],
    [{ smoking: 1 }, { smoking: 2 }],
    [{ schedule: 1 }, { schedule: 3 }],
    [{ pets: 2 }, { pets: 4 }],
    [{ cooking: 1 }, { cooking: 5 }],
    [{ rent_payment: 3 }, { rent_payment: 3 }],
    [{ food_habit: 1 }, { food_habit: 3 }],
    [{ kitchen_preference: 1 }, { kitchen_preference: 3 }],
  ])(
    "says nothing about a middling or unremarkable item (%j vs %j)",
    (x, y) => {
      const result = computeCompatibility(
        emptyCard({ answers: x }),
        emptyCard({ user_id: "b", answers: y }),
      );
      expect(result.shared).toEqual([]);
      expect(result.conflicts).toEqual([]);
    },
  );

  it("names shared localities in a stable order and counts the rest", () => {
    const first = emptyCard({
      preferred_localities: ["Whitefield", "koramangala", "HSR Layout"],
    });
    const second = emptyCard({
      user_id: "b",
      preferred_localities: ["Koramangala", "hsr  layout", "Whitefield"],
    });
    const forward = computeCompatibility(first, second);
    expect(forward.shared).toEqual([
      "Both looking in HSR Layout, Koramangala and 1 more",
    ]);
    expect(computeCompatibility(second, first).shared).toEqual(forward.shared);

    const two = computeCompatibility(
      emptyCard({ preferred_localities: ["Indiranagar", "BTM Layout"] }),
      emptyCard({
        user_id: "b",
        preferred_localities: ["BTM Layout", "Indiranagar", "Whitefield"],
      }),
    );
    expect(two.shared).toEqual(["Both looking in BTM Layout and Indiranagar"]);
  });

  it("flags no common locality only when both stated some", () => {
    const stated = emptyCard({ preferred_localities: ["Whitefield"] });
    expect(
      computeCompatibility(
        stated,
        emptyCard({ user_id: "b", preferred_localities: ["Indiranagar"] }),
      ).conflicts,
    ).toEqual(["No preferred localities in common"]);
    const neutral = computeCompatibility(stated, emptyCard({ user_id: "b" }));
    expect(neutral.shared).toEqual([]);
    expect(neutral.conflicts).toEqual([]);
  });

  it("never mentions a factor that had no data", () => {
    const random = seededRandom(8080);
    const topicWords: Record<string, RegExp> = {
      budget: /budget/i,
      cleanliness: /cleanliness|tidy|tidiness|spotless|clean home/i,
      sleep: /sleep/i,
      food: /food|vegetarian|vegan|eggetarian/i,
      schedule: /daily schedule/i,
      guests: /guests/i,
    };
    for (let i = 0; i < 300; i += 1) {
      const result = computeCompatibility(
        randomCard(random, "a"),
        randomCard(random, "b"),
      );
      const text = [
        ...result.shared,
        ...result.conflicts,
        result.explanation,
      ].join(" | ");
      for (const [factor, pattern] of Object.entries(topicWords)) {
        if (
          result.breakdown[factor as keyof typeof result.breakdown].score ===
          null
        ) {
          expect(text).not.toMatch(pattern);
        }
      }
    }
  });

  it("explains with one sentence when there is nothing to flag, two otherwise", () => {
    const calm = computeCompatibility(
      emptyCard({ answers: { cleanliness: 4 } }),
      emptyCard({ user_id: "b", answers: { cleanliness: 4 } }),
    );
    expect(calm.explanation).toBe(
      "Strong match: you two line up on cleanliness.",
    );
    const mixed = computeCompatibility(
      emptyCard({ answers: { cleanliness: 4, sleep_schedule: 1, guests: 1 } }),
      emptyCard({
        user_id: "b",
        answers: { cleanliness: 4, sleep_schedule: 5, guests: 5 },
      }),
    );
    expect(mixed.explanation).toBe(
      "Fair match: you two line up on cleanliness. Worth talking through early: sleep schedule and guests.",
    );
    const onlyConflict = computeCompatibility(
      emptyCard({ answers: { sleep_schedule: 1 } }),
      emptyCard({ user_id: "b", answers: { sleep_schedule: 5 } }),
    );
    expect(onlyConflict.explanation).toBe(
      "Low match, based on the answers you both gave. Worth talking through early: sleep schedule.",
    );
  });
});

describe("rankCandidates", () => {
  const me = fullCard({ user_id: "me" });

  it("sorts by score, best first", () => {
    const perfect = fullCard({ user_id: "perfect" });
    const good = withAnswers(fullCard({ user_id: "good" }), { cleanliness: 3 });
    const poor = withAnswers(fullCard({ user_id: "poor" }), {
      cleanliness: 1,
      sleep_schedule: 5,
      schedule: 2,
    });
    const { ranked, excluded } = rankCandidates(me, [poor, perfect, good]);
    expect(ranked.map((r) => r.candidate.user_id)).toEqual([
      "perfect",
      "good",
      "poor",
    ]);
    expect(ranked[0]?.result.score).toBe(100);
    expect(ranked[1]?.result.score).toBeLessThan(100);
    expect(ranked[2]?.result.score).toBeLessThan(
      ranked[1]?.result.score ?? Number.NaN,
    );
    expect(ranked[1]?.result).toEqual(computeCompatibility(me, good));
    expect(excluded).toEqual([]);
  });

  it("breaks score ties by most recent activity, then by input order", () => {
    const at = (id: string, last: string | null | undefined) =>
      fullCard({ user_id: id, last_active_at: last });
    const { ranked } = rankCandidates(me, [
      at("never-1", null),
      at("old", "2026-11-01T08:00:00Z"),
      at("tie-1", "2026-11-09T08:00:00Z"),
      at("invalid", "not a date"),
      at("newest", "2026-11-10T23:59:59Z"),
      at("tie-2", "2026-11-09T08:00:00Z"),
      at("never-2", undefined),
    ]);
    expect(ranked.map((r) => r.candidate.user_id)).toEqual([
      "newest",
      "tie-1",
      "tie-2",
      "old",
      "never-1",
      "invalid",
      "never-2",
    ]);
  });

  it("ranks a higher score above a more recent but weaker candidate", () => {
    const weakRecent = withAnswers(
      fullCard({ user_id: "weak", last_active_at: "2026-11-11T00:00:00Z" }),
      { cleanliness: 2 },
    );
    const strongOld = fullCard({
      user_id: "strong",
      last_active_at: "2025-01-01T00:00:00Z",
    });
    expect(
      rankCandidates(me, [weakRecent, strongOld]).ranked.map(
        (r) => r.candidate.user_id,
      ),
    ).toEqual(["strong", "weak"]);
  });

  it("drops candidates who violate my deal-breakers, with the reason", () => {
    const strict = fullCard({ user_id: "me", deal_breakers: ["smoking"] });
    const smoker = withAnswers(fullCard({ user_id: "smoker" }), { smoking: 3 });
    const fine = fullCard({ user_id: "fine" });
    const { ranked, excluded } = rankCandidates(strict, [smoker, fine]);
    expect(ranked.map((r) => r.candidate.user_id)).toEqual(["fine"]);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.candidate).toBe(smoker);
    expect(excluded[0]?.reason).toBe("hard_filter");
    expect(excluded[0]?.check).toEqual(checkDealBreakers(strict, smoker));
    expect(excluded[0]?.check?.failures[0]).toMatchObject({
      rule: "smoking",
      side: "a",
      holder_id: "me",
      violator_id: "smoker",
    });
  });

  it("drops candidates whose own deal-breakers or preferences I violate", () => {
    const hasPet = withAnswers(fullCard({ user_id: "me", age: 40 }), {
      pets: 1,
    });
    const noPets = fullCard({ user_id: "no-pets", deal_breakers: ["pets"] });
    const young = fullCard({
      user_id: "young-only",
      preferences: {
        preferred_genders: [],
        age_min: 18,
        age_max: 30,
        occupation_prefs: [],
      },
    });
    const { ranked, excluded } = rankCandidates(hasPet, [noPets, young]);
    expect(ranked).toEqual([]);
    expect(
      excluded.map((e) => [
        e.candidate.user_id,
        e.check?.failures.map((f) => `${f.rule}:${f.side}`),
      ]),
    ).toEqual([
      ["no-pets", ["pets:b"]],
      ["young-only", ["age_range:b"]],
    ]);
  });

  it("keeps a candidate whose deal-breaker question I have not answered", () => {
    const unanswered = withAnswers(fullCard({ user_id: "me" }), {
      smoking: undefined,
    });
    const strict = fullCard({ user_id: "strict", deal_breakers: ["smoking"] });
    const { ranked, excluded } = rankCandidates(unanswered, [strict]);
    expect(ranked).toHaveLength(1);
    expect(excluded).toEqual([]);
  });

  it("excludes myself", () => {
    const { ranked, excluded } = rankCandidates(me, [
      fullCard({ user_id: "me" }),
      fullCard({ user_id: "other" }),
    ]);
    expect(ranked.map((r) => r.candidate.user_id)).toEqual(["other"]);
    expect(excluded).toEqual([
      {
        candidate: expect.objectContaining({ user_id: "me" }),
        reason: "self",
        check: null,
      },
    ]);
  });

  it("handles an empty pool and does not mutate its input", () => {
    expect(rankCandidates(me, [])).toEqual({ ranked: [], excluded: [] });
    const pool = [
      withAnswers(fullCard({ user_id: "low" }), { cleanliness: 1 }),
      fullCard({ user_id: "high" }),
    ];
    const snapshot = JSON.stringify(pool);
    rankCandidates(me, pool);
    expect(JSON.stringify(pool)).toBe(snapshot);
    expect(pool.map((c) => c.user_id)).toEqual(["low", "high"]);
  });

  it("returns the caller's own candidate objects, extra fields included", () => {
    const pool = [{ ...fullCard({ user_id: "x" }), display_name: "Asha" }];
    const { ranked } = rankCandidates(me, pool);
    expect(ranked[0]?.candidate).toBe(pool[0]);
    expect(ranked[0]?.candidate.display_name).toBe("Asha");
  });

  it("changes the order when the weights change", () => {
    const base = (id: string, overrides: Partial<RoommateCard>) =>
      emptyCard({
        user_id: id,
        budget_min: 8000,
        budget_max: 12000,
        answers: { cleanliness: 5 },
        ...overrides,
      });
    const viewer = base("me", {});
    const budgetTwin = base("budget-twin", { answers: { cleanliness: 1 } });
    const cleanTwin = base("clean-twin", {
      budget_min: 20000,
      budget_max: 25000,
    });

    const byDefault = rankCandidates(viewer, [cleanTwin, budgetTwin]);
    expect(
      byDefault.ranked.map((r) => [r.candidate.user_id, r.result.score]),
    ).toEqual([
      ["budget-twin", 56],
      ["clean-twin", 44],
    ]);

    const cleanlinessFirst: CompatibilityWeights = {
      budget: 0.05,
      cleanliness: 0.5,
      sleep: 0.1,
      food: 0.1,
      smoking_drinking: 0.05,
      lifestyle: 0.05,
      schedule: 0.05,
      guests: 0.05,
      location: 0.05,
    };
    expect(validateWeights(cleanlinessFirst).valid).toBe(true);
    const reweighted = rankCandidates(
      viewer,
      [cleanTwin, budgetTwin],
      cleanlinessFirst,
    );
    expect(reweighted.ranked.map((r) => r.candidate.user_id)).toEqual([
      "clean-twin",
      "budget-twin",
    ]);
    expect(reweighted.ranked[0]?.result.score).toBeGreaterThan(80);
    expect(reweighted.ranked[1]?.result.score).toBeLessThan(20);
  });

  it("partitions a generated pool exactly and orders it consistently", () => {
    const random = seededRandom(555);
    const viewer = {
      ...randomCard(random, "me"),
      deal_breakers: ["smoking", "messy"],
    };
    const pool = Array.from({ length: 200 }, (_, i) => {
      const card = randomCard(random, `c${i}`);
      const breakers = DEAL_BREAKER_CODES.filter(() => random() < 0.1);
      return { ...card, deal_breakers: breakers };
    });
    const { ranked, excluded } = rankCandidates(viewer, pool);
    expect(ranked.length + excluded.length).toBe(pool.length);
    expect(excluded.length).toBeGreaterThan(0);
    expect(ranked.length).toBeGreaterThan(0);
    for (const entry of excluded) {
      expect(entry.check?.passed).toBe(false);
      // The verdict is the same from the candidate's point of view.
      const mirrored = checkDealBreakers(entry.candidate, viewer);
      expect(mirrored.passed).toBe(false);
      expect(mirrored.failures.map((f) => f.rule).sort()).toEqual(
        entry.check?.failures.map((f) => f.rule).sort(),
      );
    }
    for (const entry of ranked) {
      expect(checkDealBreakers(viewer, entry.candidate).passed).toBe(true);
    }
    for (let i = 1; i < ranked.length; i += 1) {
      expect(ranked[i - 1]?.result.score).toBeGreaterThanOrEqual(
        ranked[i]?.result.score ?? Number.NaN,
      );
    }
  });
});
