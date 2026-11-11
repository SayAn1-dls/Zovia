/**
 * Roommate compatibility engine (spec 6.3). Pure and deterministic: no
 * database, network, clock or randomness.
 *
 * Typical use, with rows from `roommate_candidates()` and weights from
 * `compatibility_weights`:
 *
 *   const { ranked, excluded } = rankCandidates(me, candidates, weights);
 */
export * from "./types";
export {
  describeAnswer,
  getAnswer,
  LIFESTYLE_QUESTIONS,
  optionCount,
  QUESTION_CODES,
  type QuestionCode,
} from "./questions";
export { checkDealBreakers, DEAL_BREAKER_RULES } from "./deal-breakers";
export {
  answerCloseness,
  BUDGET_TOUCH_SCORE,
  budgetRange,
  CHORES_MATRIX,
  FACTOR_SCORERS,
  FOOD_HABIT_SIMILARITY,
  KITCHEN_COMFORT,
  LOCATION_NEUTRAL_SCORE,
  localityKeys,
  normaliseLocality,
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
  type BudgetRange,
} from "./factors";
export {
  collectInsights,
  MAX_CONFLICTS,
  MAX_SHARED,
  selectInsights,
  type Insight,
} from "./insights";
export {
  computeCompatibility,
  rankCandidates,
  validateWeights,
  WEIGHT_SUM_TOLERANCE,
} from "./engine";
