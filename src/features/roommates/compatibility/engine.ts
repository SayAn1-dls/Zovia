import { checkDealBreakers } from "./deal-breakers";
import { scoreFactor } from "./factors";
import { collectInsights, selectInsights, type Insight } from "./insights";
import { getAnswer, QUESTION_CODES } from "./questions";
import {
  ALGORITHM_VERSION,
  DEFAULT_WEIGHTS,
  FACTORS,
  type CompatibilityResult,
  type CompatibilityWeights,
  type Confidence,
  type ExcludedCandidate,
  type Factor,
  type FactorBreakdown,
  type RankedCandidate,
  type Ranking,
  type RoommateCard,
  type WeightsValidation,
} from "./types";

export const WEIGHT_SUM_TOLERANCE = 0.001;

/**
 * Checks a weights object as stored in `compatibility_weights`: every factor
 * present, no unknown factor, each weight a number in 0..1, and the sum equal
 * to 1 within 0.001.
 */
export function validateWeights(weights: unknown): WeightsValidation {
  const errors: string[] = [];
  if (
    weights === null ||
    typeof weights !== "object" ||
    Array.isArray(weights)
  ) {
    return {
      valid: false,
      errors: ["weights must be an object keyed by factor"],
    };
  }
  const record = weights as Record<string, unknown>;
  let sum = 0;
  let summable = true;
  for (const factor of FACTORS) {
    if (!Object.prototype.hasOwnProperty.call(record, factor)) {
      errors.push(`missing weight for "${factor}"`);
      summable = false;
      continue;
    }
    const value = record[factor];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`weight for "${factor}" must be a number`);
      summable = false;
    } else if (value < 0 || value > 1) {
      errors.push(`weight for "${factor}" must be between 0 and 1`);
      summable = false;
    } else {
      sum += value;
    }
  }
  for (const key of Object.keys(record)) {
    if (!(FACTORS as readonly string[]).includes(key)) {
      errors.push(`unknown factor "${key}"`);
    }
  }
  if (summable && Math.abs(sum - 1) > WEIGHT_SUM_TOLERANCE) {
    errors.push(`weights must sum to 1 (got ${Number(sum.toFixed(4))})`);
  }
  return { valid: errors.length === 0, errors };
}

function assertUsableWeights(weights: CompatibilityWeights): void {
  for (const factor of FACTORS) {
    const value = weights?.[factor];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new RangeError(
        `compatibility weight for "${factor}" must be a non-negative number`,
      );
    }
  }
}

function joinTopics(topics: readonly string[]): string {
  if (topics.length <= 1) return topics.join("");
  return `${topics.slice(0, -1).join(", ")} and ${topics[topics.length - 1]}`;
}

function uniqueTopics(insights: readonly Insight[], limit: number): string[] {
  const topics: string[] = [];
  for (const insight of insights) {
    if (!topics.includes(insight.topic)) topics.push(insight.topic);
    if (topics.length === limit) break;
  }
  return topics;
}

function matchBand(score: number): string {
  if (score >= 80) return "Strong match";
  if (score >= 60) return "Good match";
  if (score >= 40) return "Fair match";
  return "Low match";
}

function explain(
  score: number,
  shared: readonly Insight[],
  conflicts: readonly Insight[],
): string {
  const agree = uniqueTopics(shared, 3);
  const differ = uniqueTopics(conflicts, 2);
  const first =
    agree.length > 0
      ? `${matchBand(score)}: you two line up on ${joinTopics(agree)}.`
      : `${matchBand(score)}, based on the answers you both gave.`;
  return differ.length > 0
    ? `${first} Worth talking through early: ${joinTopics(differ)}.`
    : first;
}

/**
 * Compatibility of two people. Symmetric: (a, b) and (b, a) give deeply equal
 * results. Does not apply deal-breakers; call `checkDealBreakers` (or
 * `rankCandidates`) first.
 *
 *   raw_score = sum(score_f * weight_f) / sum(weight_f)   over scored factors
 *   score     = round(raw_score * 100)
 *
 * Confidence, with coverage = share of total weight carried by scored factors
 * and answers = questions both people answered (out of 16):
 *   high    coverage >= 0.8 and answers >= 12
 *   medium  coverage >= 0.5 and answers >= 6
 *   low     otherwise
 *
 * Throws RangeError when a weight is missing, negative or not a number.
 */
export function computeCompatibility(
  a: RoommateCard,
  b: RoommateCard,
  weights: CompatibilityWeights = DEFAULT_WEIGHTS,
): CompatibilityResult {
  assertUsableWeights(weights);

  const scores = {} as Record<Factor, number | null>;
  let totalWeight = 0;
  let scoredWeight = 0;
  let factorsScored = 0;
  for (const factor of FACTORS) {
    const score = scoreFactor(factor, a, b);
    scores[factor] = score;
    totalWeight += weights[factor];
    if (score !== null) {
      factorsScored += 1;
      scoredWeight += weights[factor];
    }
  }

  const insufficient = scoredWeight <= 0;
  const breakdown = {} as Record<Factor, FactorBreakdown>;
  let raw = 0;
  for (const factor of FACTORS) {
    const score = scores[factor];
    const effective =
      score === null || insufficient ? 0 : weights[factor] / scoredWeight;
    const contribution = score === null ? 0 : score * effective;
    raw += contribution;
    breakdown[factor] = {
      score,
      weight: weights[factor],
      effective_weight: effective,
      contribution,
    };
  }
  raw = Math.min(1, Math.max(0, raw));
  const score = Math.round(raw * 100);

  let answersCompared = 0;
  for (const code of QUESTION_CODES) {
    if (getAnswer(a, code) !== null && getAnswer(b, code) !== null) {
      answersCompared += 1;
    }
  }

  const coverage = totalWeight > 0 ? scoredWeight / totalWeight : 0;
  let confidence: Confidence = "low";
  if (coverage >= 0.8 - 1e-9 && answersCompared >= 12) confidence = "high";
  else if (coverage >= 0.5 - 1e-9 && answersCompared >= 6)
    confidence = "medium";

  const { shared, conflicts } = selectInsights(collectInsights(a, b), weights);

  return {
    algorithm_version: ALGORITHM_VERSION,
    score,
    raw_score: raw,
    confidence,
    insufficient_data: insufficient,
    factors_scored: factorsScored,
    answers_compared: answersCompared,
    breakdown,
    shared: shared.map((insight) => insight.text),
    conflicts: conflicts.map((insight) => insight.text),
    explanation: insufficient
      ? "There is not enough information on both profiles to estimate compatibility yet."
      : explain(score, shared, conflicts),
  };
}

function activityTime(card: RoommateCard): number {
  if (typeof card.last_active_at !== "string") return Number.NEGATIVE_INFINITY;
  const time = Date.parse(card.last_active_at);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Ranks a candidate pool for `me`.
 *
 * Candidates that are `me`, or that fail `checkDealBreakers` in either
 * direction, are returned in `excluded` with the reason (for tests and admin
 * debugging; never shown to users). The rest are scored and sorted by
 * percentage (highest first), then by `last_active_at` (most recent first,
 * missing last), then by their position in the input.
 */
export function rankCandidates<T extends RoommateCard>(
  me: RoommateCard,
  candidates: readonly T[],
  weights: CompatibilityWeights = DEFAULT_WEIGHTS,
): Ranking<T> {
  assertUsableWeights(weights);
  const excluded: ExcludedCandidate<T>[] = [];
  const scored: (RankedCandidate<T> & { index: number; active: number })[] = [];

  candidates.forEach((candidate, index) => {
    if (candidate.user_id === me.user_id) {
      excluded.push({ candidate, reason: "self", check: null });
      return;
    }
    const check = checkDealBreakers(me, candidate);
    if (!check.passed) {
      excluded.push({ candidate, reason: "hard_filter", check });
      return;
    }
    scored.push({
      candidate,
      result: computeCompatibility(me, candidate, weights),
      index,
      active: activityTime(candidate),
    });
  });

  scored.sort(
    (x, y) =>
      y.result.score - x.result.score ||
      (x.active === y.active ? 0 : y.active > x.active ? 1 : -1) ||
      x.index - y.index,
  );

  return {
    ranked: scored.map(({ candidate, result }) => ({ candidate, result })),
    excluded,
  };
}
