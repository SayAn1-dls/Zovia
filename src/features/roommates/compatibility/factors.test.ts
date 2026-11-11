import { describe, expect, it } from "vitest";

import {
  budgetRange,
  CHORES_MATRIX,
  FACTOR_SCORERS,
  FOOD_HABIT_SIMILARITY,
  KITCHEN_COMFORT,
  localityKeys,
  ordinalCloseness,
  PETS_MATRIX,
  SCHEDULE_MATRIX,
  scoreBudget,
  scoreChores,
  scoreCleanliness,
  scoreFactor,
  scoreFood,
  scoreGuests,
  scoreLifestyle,
  scoreLocation,
  scorePets,
  scoreSchedule,
  scoreSleep,
  scoreSmokingDrinking,
} from "./factors";
import { emptyCard, fullCard, randomCard, seededRandom } from "./fixtures";
import {
  describeAnswer,
  getAnswer,
  LIFESTYLE_QUESTIONS,
  optionCount,
  QUESTION_CODES,
} from "./questions";
import { FACTORS } from "./types";

const answers = (values: Record<string, number>) =>
  emptyCard({ answers: values });
const budget = (min: number | null, max: number | null) =>
  emptyCard({ budget_min: min, budget_max: max });

describe("questionnaire reference data", () => {
  it("has the sixteen questions with the agreed factors and option counts", () => {
    const summary = QUESTION_CODES.map((code) => [
      code,
      LIFESTYLE_QUESTIONS[code].factor,
      LIFESTYLE_QUESTIONS[code].kind,
      optionCount(code),
    ]);
    expect(summary).toEqual([
      ["food_habit", "food", "choice", 4],
      ["kitchen_preference", "food", "choice", 3],
      ["smoking", "smoking_drinking", "choice", 3],
      ["drinking", "smoking_drinking", "choice", 3],
      ["sleep_schedule", "sleep", "scale", 5],
      ["cleanliness", "cleanliness", "scale", 5],
      ["social_level", "lifestyle", "scale", 5],
      ["noise", "lifestyle", "scale", 5],
      ["pets", "lifestyle", "choice", 4],
      ["cooking", "lifestyle", "scale", 5],
      ["personal_space", "lifestyle", "scale", 5],
      ["chores", "lifestyle", "choice", 3],
      ["rent_payment", "lifestyle", "choice", 3],
      ["schedule", "schedule", "choice", 5],
      ["guests", "guests", "scale", 5],
      ["overnight_guests", "guests", "choice", 3],
    ]);
  });

  it("has a label and a descriptor for every option, numbered from 1", () => {
    for (const code of QUESTION_CODES) {
      const question = LIFESTYLE_QUESTIONS[code];
      const expected = Array.from({ length: optionCount(code) }, (_, i) =>
        String(i + 1),
      );
      expect(Object.keys(question.options)).toEqual(expected);
      expect(Object.keys(question.describe)).toEqual(expected);
      for (let value = 1; value <= optionCount(code); value += 1) {
        expect(describeAnswer(code, value)).toMatch(/\S/);
      }
    }
  });

  it("uses the agreed labels", () => {
    expect(LIFESTYLE_QUESTIONS.food_habit.options).toEqual({
      1: "Vegetarian",
      2: "Eggetarian",
      3: "Non-vegetarian",
      4: "Vegan",
    });
    expect(LIFESTYLE_QUESTIONS.sleep_schedule.options[5]).toBe(
      "Night owl (after 2 am)",
    );
    expect(LIFESTYLE_QUESTIONS.overnight_guests.options[2]).toBe(
      "Occasionally with notice",
    );
  });

  it.each([
    [{ smoking: 2 }, 2],
    [{ smoking: 0 }, null],
    [{ smoking: 4 }, null],
    [{ smoking: 1.5 }, null],
    [{ smoking: Number.NaN }, null],
    [{ smoking: "2" as unknown as number }, null],
    [{}, null],
  ])("getAnswer(%j) -> %s", (values, expected) => {
    expect(getAnswer({ answers: values }, "smoking")).toBe(expected);
  });

  it("does not read answers from the prototype chain or a missing object", () => {
    const inherited = Object.create({ smoking: 2 }) as Record<string, number>;
    expect(getAnswer({ answers: inherited }, "smoking")).toBeNull();
    expect(getAnswer({ answers: null as never }, "smoking")).toBeNull();
  });
});

describe("ordinalCloseness", () => {
  it.each([
    [1, 1, 5, 1],
    [1, 2, 5, 0.75],
    [1, 3, 5, 0.5],
    [2, 5, 5, 0.25],
    [5, 1, 5, 0],
    [1, 2, 3, 0.5],
    [3, 1, 3, 0],
  ])("closeness(%i, %i) on %i points = %s", (x, y, points, expected) => {
    expect(ordinalCloseness(x, y, points)).toBe(expected);
  });
});

describe("scoreBudget", () => {
  it.each([
    ["identical ranges", [8000, 12000], [8000, 12000], 1],
    ["overlap is half of the narrower range", [8000, 12000], [10000, 15000], 1],
    [
      "overlap is a quarter of the narrower range",
      [8000, 12000],
      [11000, 15000],
      0.875,
    ],
    ["one range inside the other", [9000, 10000], [5000, 20000], 1],
    ["ranges only touch", [8000, 10000], [10000, 14000], 0.75],
    ["a fixed budget inside the other range", [10000, 10000], [8000, 12000], 1],
    ["two equal fixed budgets", [9000, 9000], [9000, 9000], 1],
    [
      "gap of a quarter of the lower maximum",
      [6000, 10000],
      [12500, 15000],
      0.375,
    ],
    [
      "gap of exactly half of the lower maximum",
      [6000, 10000],
      [15000, 20000],
      0,
    ],
    ["gap beyond half of the lower maximum", [6000, 10000], [30000, 40000], 0],
    ["both budgets zero", [0, 0], [0, 0], 1],
    ["zero budget against a real one", [0, 0], [5000, 10000], 0],
  ] as const)("%s", (_name, a, b, expected) => {
    expect(scoreBudget(budget(a[0], a[1]), budget(b[0], b[1]))).toBeCloseTo(
      expected,
      12,
    );
    expect(scoreBudget(budget(b[0], b[1]), budget(a[0], a[1]))).toBeCloseTo(
      expected,
      12,
    );
  });

  it("is continuous where overlap turns into a gap", () => {
    const touching = scoreBudget(budget(8000, 10000), budget(10000, 14000));
    const justApart = scoreBudget(budget(8000, 10000), budget(10001, 14000));
    expect(touching).toBe(0.75);
    expect(justApart).toBeGreaterThan(0.749);
    expect(justApart).toBeLessThan(0.75);
  });

  it("never rises as the other range moves further away", () => {
    let previous = 1;
    for (let start = 8000; start <= 30000; start += 250) {
      const score = scoreBudget(
        budget(8000, 12000),
        budget(start, start + 4000),
      ) as number;
      expect(score).toBeLessThanOrEqual(previous + 1e-12);
      expect(score).toBeGreaterThanOrEqual(0);
      previous = score;
    }
    expect(previous).toBe(0);
  });

  it("treats a missing minimum as zero and swaps reversed bounds", () => {
    expect(budgetRange(budget(null, 10000))).toEqual({ min: 0, max: 10000 });
    expect(budgetRange(budget(12000, 8000))).toEqual({ min: 8000, max: 12000 });
    expect(scoreBudget(budget(null, 10000), budget(4000, 6000))).toBe(1);
  });

  it.each([
    [8000, null],
    [null, null],
    [-1, 5000],
    [1000, -5],
    [1000, Number.NaN],
    [Number.POSITIVE_INFINITY, 5000],
  ])("returns null when a budget is unusable (%s, %s)", (min, max) => {
    expect(budgetRange(budget(min, max))).toBeNull();
    expect(scoreBudget(budget(min, max), budget(8000, 12000))).toBeNull();
    expect(scoreBudget(budget(8000, 12000), budget(min, max))).toBeNull();
  });
});

describe("scoreCleanliness and scoreSleep", () => {
  it.each([
    [5, 5, 1],
    [5, 4, 0.75],
    [5, 3, 0.5],
    [4, 1, 0.25],
    [1, 5, 0],
  ])("%i vs %i -> %s", (x, y, expected) => {
    expect(
      scoreCleanliness(
        answers({ cleanliness: x }),
        answers({ cleanliness: y }),
      ),
    ).toBe(expected);
    expect(
      scoreSleep(
        answers({ sleep_schedule: x }),
        answers({ sleep_schedule: y }),
      ),
    ).toBe(expected);
  });

  it("returns null when either side has not answered", () => {
    expect(
      scoreCleanliness(answers({ cleanliness: 3 }), answers({})),
    ).toBeNull();
    expect(
      scoreCleanliness(answers({}), answers({ cleanliness: 3 })),
    ).toBeNull();
    expect(scoreSleep(answers({}), answers({}))).toBeNull();
    // An answer to a different question is no help.
    expect(
      scoreSleep(answers({ cleanliness: 3 }), answers({ sleep_schedule: 3 })),
    ).toBeNull();
  });
});

describe("scoreSchedule", () => {
  it.each([
    [1, 1, 1],
    [1, 2, 0.2],
    [1, 3, 0.8],
    [1, 4, 0.7],
    [1, 5, 0.5],
    [2, 2, 1],
    [2, 3, 0.7],
    [2, 4, 0.6],
    [2, 5, 0.5],
    [3, 3, 1],
    [3, 4, 0.8],
    [3, 5, 0.7],
    [4, 4, 1],
    [4, 5, 0.6],
    [5, 5, 1],
  ])("%i vs %i -> %s (both orders)", (x, y, expected) => {
    expect(
      scoreSchedule(answers({ schedule: x }), answers({ schedule: y })),
    ).toBe(expected);
    expect(
      scoreSchedule(answers({ schedule: y }), answers({ schedule: x })),
    ).toBe(expected);
  });

  it("makes day vs night the worst pairing and keeps flexible mid-to-high", () => {
    const values = Object.entries(SCHEDULE_MATRIX);
    const lowest = values.reduce((min, entry) =>
      entry[1] < min[1] ? entry : min,
    );
    expect(lowest[0]).toBe("1-2");
    for (const [key, value] of values) {
      if (key.includes("3")) expect(value).toBeGreaterThanOrEqual(0.7);
    }
  });

  it("returns null when unanswered", () => {
    expect(scoreSchedule(answers({ schedule: 1 }), answers({}))).toBeNull();
  });
});

describe("scoreFood", () => {
  const food = (habit: number, kitchen?: number) =>
    answers(
      kitchen === undefined
        ? { food_habit: habit }
        : { food_habit: habit, kitchen_preference: kitchen },
    );

  it.each([
    [
      "vegetarian wanting a veg-only kitchen vs non-vegetarian",
      [1, 1],
      [3, 3],
      0.0375,
    ],
    [
      "vegan wanting a veg-only kitchen vs non-vegetarian",
      [4, 1],
      [3, 3],
      0.035,
    ],
    ["vegetarian fine with eggs vs non-vegetarian", [1, 2], [3, 3], 0.3],
    ["vegetarian fine with anything vs non-vegetarian", [1, 3], [3, 3], 0.75],
    ["vegetarian wanting veg-only vs eggetarian", [1, 1], [2, 2], 0.35],
    ["vegetarian fine with eggs vs eggetarian", [1, 2], [2, 3], 0.875],
    ["vegetarian vs vegan, both veg-only", [1, 1], [4, 1], 0.925],
    ["eggetarian fine with eggs vs non-vegetarian", [2, 2], [3, 3], 0.35],
    ["eggetarian fine with anything vs non-vegetarian", [2, 3], [3, 3], 0.875],
    ["vegan fine with anything vs eggetarian", [4, 3], [2, 3], 0.8],
  ] as const)("%s", (_name, a, b, expected) => {
    expect(scoreFood(food(a[0], a[1]), food(b[0], b[1]))).toBeCloseTo(
      expected,
      12,
    );
    expect(scoreFood(food(b[0], b[1]), food(a[0], a[1]))).toBeCloseTo(
      expected,
      12,
    );
  });

  it.each([1, 2, 3, 4])(
    "scores 1 for the same habit %i whatever the kitchen preferences",
    (habit) => {
      for (const kitchenA of [undefined, 1, 2, 3]) {
        for (const kitchenB of [undefined, 1, 2, 3]) {
          expect(scoreFood(food(habit, kitchenA), food(habit, kitchenB))).toBe(
            1,
          );
        }
      }
    },
  );

  it("imposes no kitchen limit when the kitchen preference is unanswered", () => {
    expect(scoreFood(food(1), food(3))).toBe(0.75);
    // Only the non-vegetarian stated a preference, and vegetarian food suits it.
    expect(scoreFood(food(1), food(3, 1))).toBe(0.75);
  });

  it("uses the stricter of the two kitchen preferences", () => {
    const strict = scoreFood(food(2, 1), food(3, 3)) as number;
    const relaxed = scoreFood(food(2, 3), food(3, 3)) as number;
    expect(strict).toBeLessThan(relaxed);
    expect(strict).toBeCloseTo(0.05 * 0.875, 12);
  });

  it("needs both food habits", () => {
    expect(
      scoreFood(food(1, 1), answers({ kitchen_preference: 1 })),
    ).toBeNull();
    expect(scoreFood(answers({}), food(1))).toBeNull();
  });

  it("has complete, bounded matrices", () => {
    for (let x = 1; x <= 4; x += 1) {
      for (let y = x; y <= 4; y += 1) {
        const similarity = FOOD_HABIT_SIMILARITY[`${x}-${y}`];
        expect(similarity).toBeGreaterThan(0);
        expect(similarity).toBeLessThanOrEqual(1);
        expect(similarity === 1).toBe(x === y);
      }
    }
    for (let kitchen = 1; kitchen <= 3; kitchen += 1) {
      for (let habit = 1; habit <= 4; habit += 1) {
        const comfort = KITCHEN_COMFORT[kitchen]?.[habit];
        expect(comfort).toBeGreaterThan(0);
        expect(comfort).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("scoreSmokingDrinking", () => {
  it.each([
    [{ smoking: 1, drinking: 1 }, { smoking: 1, drinking: 1 }, 1],
    [{ smoking: 1, drinking: 2 }, { smoking: 3, drinking: 2 }, 0.4],
    [{ smoking: 2, drinking: 1 }, { smoking: 2, drinking: 3 }, 0.6],
    [{ smoking: 1, drinking: 1 }, { smoking: 2, drinking: 2 }, 0.5],
    [{ smoking: 1, drinking: 1 }, { smoking: 3, drinking: 3 }, 0],
    [{ smoking: 1 }, { smoking: 2, drinking: 3 }, 0.5],
    [{ drinking: 1 }, { smoking: 3, drinking: 1 }, 1],
  ])("%j vs %j -> %s", (a, b, expected) => {
    expect(scoreSmokingDrinking(answers(a), answers(b))).toBeCloseTo(
      expected,
      12,
    );
    expect(scoreSmokingDrinking(answers(b), answers(a))).toBeCloseTo(
      expected,
      12,
    );
  });

  it("returns null when no question is answered by both", () => {
    expect(
      scoreSmokingDrinking(answers({ smoking: 1 }), answers({ drinking: 1 })),
    ).toBeNull();
    expect(scoreSmokingDrinking(answers({}), answers({}))).toBeNull();
  });
});

describe("scoreLifestyle", () => {
  it.each([
    [1, 1, 1],
    [1, 2, 1],
    [1, 3, 0.25],
    [1, 4, 0],
    [2, 2, 1],
    [2, 3, 0.7],
    [2, 4, 0.6],
    [3, 3, 1],
    [3, 4, 1],
    [4, 4, 1],
  ])("pets %i vs %i -> %s (both orders)", (x, y, expected) => {
    expect(scorePets(answers({ pets: x }), answers({ pets: y }))).toBe(
      expected,
    );
    expect(scorePets(answers({ pets: y }), answers({ pets: x }))).toBe(
      expected,
    );
    expect(PETS_MATRIX[`${x}-${y}`]).toBe(expected);
  });

  it.each([
    [1, 1, 1],
    [1, 2, 0.6],
    [1, 3, 0.3],
    [2, 2, 1],
    [2, 3, 0.5],
    [3, 3, 1],
  ])("chores %i vs %i -> %s (both orders)", (x, y, expected) => {
    expect(scoreChores(answers({ chores: x }), answers({ chores: y }))).toBe(
      expected,
    );
    expect(scoreChores(answers({ chores: y }), answers({ chores: x }))).toBe(
      expected,
    );
    expect(CHORES_MATRIX[`${x}-${y}`]).toBe(expected);
  });

  it("is the mean of the items both people answered", () => {
    // social 1 vs 5 -> 0, noise 2 vs 2 -> 1
    expect(
      scoreLifestyle(
        answers({ social_level: 1, noise: 2 }),
        answers({ social_level: 5, noise: 2 }),
      ),
    ).toBe(0.5);
    // allergic vs has a pet -> 0, on its own
    expect(scoreLifestyle(answers({ pets: 4 }), answers({ pets: 1 }))).toBe(0);
    // social 0.75, noise 0.5, pets 0.25, cooking 1, space 0.75, chores 0.3, rent 0.5
    expect(
      scoreLifestyle(
        answers({
          social_level: 3,
          noise: 2,
          pets: 1,
          cooking: 4,
          personal_space: 3,
          chores: 1,
          rent_payment: 1,
        }),
        answers({
          social_level: 4,
          noise: 4,
          pets: 3,
          cooking: 4,
          personal_space: 2,
          chores: 3,
          rent_payment: 2,
        }),
      ),
    ).toBeCloseTo((0.75 + 0.5 + 0.25 + 1 + 0.75 + 0.3 + 0.5) / 7, 12);
  });

  it("ignores items only one person answered", () => {
    expect(
      scoreLifestyle(
        answers({ social_level: 3, noise: 1, cooking: 5 }),
        answers({ social_level: 3, pets: 1 }),
      ),
    ).toBe(1);
  });

  it("returns null when nothing is answered by both", () => {
    expect(
      scoreLifestyle(answers({ noise: 1 }), answers({ pets: 1 })),
    ).toBeNull();
    // Answers belonging to other factors do not count.
    expect(
      scoreLifestyle(answers({ cleanliness: 1 }), answers({ cleanliness: 1 })),
    ).toBeNull();
  });
});

describe("scoreGuests", () => {
  it.each([
    [{ guests: 2, overnight_guests: 2 }, { guests: 2, overnight_guests: 2 }, 1],
    [
      { guests: 1, overnight_guests: 1 },
      { guests: 3, overnight_guests: 3 },
      0.25,
    ],
    [{ guests: 1, overnight_guests: 1 }, { guests: 5, overnight_guests: 3 }, 0],
    [{ guests: 2 }, { guests: 3, overnight_guests: 3 }, 0.75],
    [{ overnight_guests: 2 }, { overnight_guests: 3 }, 0.5],
  ])("%j vs %j -> %s", (a, b, expected) => {
    expect(scoreGuests(answers(a), answers(b))).toBe(expected);
    expect(scoreGuests(answers(b), answers(a))).toBe(expected);
  });

  it("returns null when no question is answered by both", () => {
    expect(
      scoreGuests(answers({ guests: 1 }), answers({ overnight_guests: 1 })),
    ).toBeNull();
  });
});

describe("scoreLocation", () => {
  const place = (
    localities: string[] | null,
    city: string | null = "Bengaluru",
  ) => emptyCard({ city, preferred_localities: localities });

  it.each([
    ["same single locality", ["Koramangala"], ["Koramangala"], 1],
    [
      "all of the shorter list shared",
      ["Koramangala"],
      ["Koramangala", "HSR Layout", "BTM Layout"],
      1,
    ],
    [
      "one of two shared",
      ["Koramangala", "Indiranagar"],
      ["Koramangala", "HSR Layout"],
      0.8,
    ],
    ["one of three shared", ["A", "B", "C"], ["A", "D", "E"], 0.6 + 0.4 / 3],
    ["nothing shared", ["Koramangala"], ["Whitefield"], 0.2],
    ["first list empty", [], ["Whitefield"], 0.5],
    ["both lists empty", [], [], 0.5],
    ["list missing", null, ["Whitefield"], 0.5],
  ] as const)("%s", (_name, a, b, expected) => {
    const x = place(a === null ? null : [...a]);
    const y = place(b === null ? null : [...b]);
    expect(scoreLocation(x, y)).toBeCloseTo(expected, 12);
    expect(scoreLocation(y, x)).toBeCloseTo(expected, 12);
  });

  it("compares localities ignoring case, spacing and duplicates", () => {
    const x = place(["  koramangala ", "HSR   Layout", "KORAMANGALA", "  "]);
    expect(localityKeys(x)).toEqual(["koramangala", "hsr layout"]);
    expect(scoreLocation(x, place(["Koramangala", "Hsr Layout"]))).toBe(1);
  });

  it("scores 0 for different cities and ignores an unknown city", () => {
    expect(
      scoreLocation(
        place(["Koramangala"], "Bengaluru"),
        place(["Koramangala"], "Pune"),
      ),
    ).toBe(0);
    expect(
      scoreLocation(
        place(["Koramangala"], " bengaluru"),
        place(["Koramangala"], "BENGALURU"),
      ),
    ).toBe(1);
    expect(
      scoreLocation(
        place(["Koramangala"], null),
        place(["Koramangala"], "Pune"),
      ),
    ).toBe(1);
  });
});

describe("scoreFactor", () => {
  it("has a scorer for every factor and dispatches to it", () => {
    expect(Object.keys(FACTOR_SCORERS)).toEqual([...FACTORS]);
    const a = fullCard();
    const b = fullCard({ user_id: "b" });
    for (const factor of FACTORS) {
      expect(scoreFactor(factor, a, b)).toBe(1);
    }
  });

  it("returns null for every answer-based factor on empty cards, and neutral location", () => {
    const a = emptyCard();
    const b = emptyCard({ user_id: "b" });
    for (const factor of FACTORS) {
      expect(scoreFactor(factor, a, b)).toBe(
        factor === "location" ? 0.5 : null,
      );
    }
  });

  it("stays within 0..1 and is symmetric for generated cards", () => {
    const random = seededRandom(20261111);
    for (let i = 0; i < 400; i += 1) {
      const a = randomCard(random, `a${i}`);
      const b = randomCard(random, `b${i}`);
      for (const factor of FACTORS) {
        const forward = scoreFactor(factor, a, b);
        expect(scoreFactor(factor, b, a)).toBe(forward);
        if (forward !== null) {
          expect(forward).toBeGreaterThanOrEqual(0);
          expect(forward).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
