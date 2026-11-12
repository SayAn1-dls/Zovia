import {
  DEFAULT_WEIGHTS,
  FACTORS,
  rankCandidates,
  validateWeights,
  type CompatibilityResult,
  type CompatibilityWeights,
  type RoommateCard,
} from "./compatibility";
import type { CardRow, CompatibilitySummary, PublicRoommateCard } from "./schemas";

/**
 * Pure glue between database cards (jsonb from roommate_candidates / roommate_profile_cards) and
 * the compatibility engine. No I/O: URLs are resolved by the caller and passed in.
 */

/** The engine's view of a card. */
export function toEngineCard(row: CardRow): RoommateCard {
  return {
    user_id: row.user_id,
    age: row.age,
    gender: row.gender,
    occupation: row.occupation,
    city: row.city,
    preferred_localities: row.preferred_localities,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    move_in_date: row.move_in_date,
    last_active_at: row.last_active_at,
    answers: row.answers,
    deal_breakers: row.deal_breakers,
    preferences: row.preferences,
  };
}

/**
 * What the browser may see of another person: display fields only. Lifestyle answers,
 * deal-breakers and preferences stay on the server (they only feed the score).
 */
export function toPublicCard(
  row: CardRow,
  urls: { avatar_url: string | null; photo_urls: string[] },
): PublicRoommateCard {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    avatar_url: urls.avatar_url,
    headline: row.headline,
    about: row.about,
    age: row.age,
    gender: row.gender,
    occupation: row.occupation,
    occupation_detail: row.occupation_detail,
    city: row.city,
    preferred_localities: row.preferred_localities,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    move_in_date: row.move_in_date,
    has_place: row.has_place,
    place: row.place,
    photo_urls: urls.photo_urls,
  };
}

export function summarise(result: CompatibilityResult): CompatibilitySummary {
  return {
    score: result.score,
    confidence: result.confidence,
    insufficient_data: result.insufficient_data,
    shared: result.shared,
    conflicts: result.conflicts,
    explanation: result.explanation,
  };
}

/**
 * Weights from `compatibility_weights` rows. Falls back to the spec defaults when the table is
 * incomplete or does not sum to 1, and says so (`valid: false`) so the caller can log it.
 */
export function weightsFromRows(rows: readonly { factor: string; weight: number | string }[]): {
  weights: CompatibilityWeights;
  valid: boolean;
  errors: string[];
} {
  const record: Record<string, number> = {};
  for (const row of rows) {
    const value = typeof row.weight === "string" ? Number(row.weight) : row.weight;
    record[row.factor] = value;
  }
  const check = validateWeights(record);
  if (!check.valid) return { weights: { ...DEFAULT_WEIGHTS }, valid: false, errors: check.errors };
  const weights = {} as CompatibilityWeights;
  for (const factor of FACTORS) weights[factor] = record[factor] as number;
  return { weights, valid: true, errors: [] };
}

/**
 * Ranks a candidate pool for `me` with the engine (deal-breakers in both directions first, then
 * the weighted score) and keeps the best `limit`.
 */
export function rankDeck(
  me: CardRow,
  pool: readonly CardRow[],
  weights: CompatibilityWeights,
  limit: number,
): { row: CardRow; result: CompatibilityResult }[] {
  const byId = new Map(pool.map((row) => [row.user_id, row]));
  const { ranked } = rankCandidates(toEngineCard(me), pool.map(toEngineCard), weights);
  const out: { row: CardRow; result: CompatibilityResult }[] = [];
  for (const { candidate, result } of ranked) {
    const row = byId.get(candidate.user_id);
    if (row) out.push({ row, result });
    if (out.length >= limit) break;
  }
  return out;
}

/** Trims, de-duplicates (case-insensitively) and caps a comma-separated locality list. */
export function parseLocalities(input: string, max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of input.split(",")) {
    const value = part.trim().replace(/\s+/g, " ");
    if (value.length < 2 || value.length > 80) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}
