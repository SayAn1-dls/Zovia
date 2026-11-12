import type { PropertyType } from "@/features/properties/schemas";

/**
 * Basic mode (no AI key): a rule-based reader for requests such as
 * "PG in Bangalore under ₹8000 with food and wifi". It only extracts filters; the search itself
 * runs through the same property service as the AI tools, so every result is a real listing.
 */

export type CityRef = { slug: string; name: string };

export type ParsedRequirements = {
  city: string | null;
  budget_min: number | null;
  budget_max: number | null;
  types: PropertyType[];
  food: boolean;
  amenities: string[];
  gender: "male" | "female" | null;
  /** Free text after "near ..." (a locality or landmark). */
  near: string | null;
  /** What we still need to ask for. */
  missing: ("city" | "budget")[];
  /** True when the message looks like an accommodation search at all. */
  is_search: boolean;
};

/** Common and older names people type for the cities we serve. */
const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru",
  banglore: "bengaluru",
  blr: "bengaluru",
  bombay: "mumbai",
  gurgaon: "gurugram",
  calcutta: "kolkata",
  madras: "chennai",
  "new delhi": "delhi",
  ncr: "delhi",
  hyd: "hyderabad",
};

const AMENITY_PATTERNS: [RegExp, string][] = [
  [/\bwi-?fi\b|\binternet\b|\bbroadband\b/, "wifi"],
  [/\ba\/?c\b|\bair[- ]?condition(?:ed|ing|er)?\b/, "ac"],
  [/\battached (?:bath(?:room)?|washroom|toilet)\b/, "attached_bathroom"],
  [/\bparking\b/, "parking"],
  [/\bgym\b/, "gym"],
  [/\blaundry\b/, "laundry"],
  [/\bwashing machine\b/, "washing_machine"],
  [/\bpower ?backup\b/, "power_backup"],
  [/\bhousekeeping\b|\bcleaning\b/, "housekeeping"],
  [/\bcctv\b/, "cctv"],
  [/\bgeyser\b|\bhot water\b/, "geyser"],
];

const PG_TYPES: PropertyType[] = ["pg", "boys_pg", "girls_pg"];

const TYPE_PATTERNS: [RegExp, PropertyType[]][] = [
  [/\bco-?living\b/, ["co_living"]],
  [/\bhostels?\b/, ["hostel"]],
  [/\bstudio\b/, ["studio"]],
  [/\b1 ?bhk\b|\bone bhk\b/, ["one_bhk"]],
  [/\b2 ?bhk\b|\btwo bhk\b/, ["two_bhk"]],
  [/\b3 ?bhk\b|\bthree bhk\b/, ["three_bhk"]],
  [/\bindependent house\b|\bhouse\b/, ["independent_house"]],
  [/\bshared room\b|\bsharing\b/, ["shared_room"]],
  [/\bprivate room\b|\bsingle room\b/, ["private_room"]],
  [/\bflat\b|\bapartment\b/, ["one_bhk", "two_bhk", "three_bhk"]],
];

const SEARCH_WORDS =
  /\b(pg|hostel|room|flat|apartment|bhk|stay|accommodation|house|studio|co-?living|rent|place to live|paying guest)\b/;

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** "8000", "8,000", "8k", "8.5k", "1 lakh", "₹ 8000" -> integer INR. */
function amount(raw: string, unit: string | undefined): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const u = (unit ?? "").toLowerCase();
  const value = u === "k" || u === "thousand" ? n * 1000 : u.startsWith("lakh") || u.startsWith("lac") ? n * 100_000 : n;
  const rounded = Math.round(value);
  return rounded >= 500 && rounded <= 10_000_000 ? rounded : null;
}

const MONEY = String.raw`(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?)?`;

function findBudget(text: string): { min: number | null; max: number | null } {
  const between = new RegExp(String.raw`(?:between|from)\s+${MONEY}\s*(?:-|to|and)\s*${MONEY}`).exec(text);
  if (between) {
    const a = amount(between[1]!, between[2] ?? between[4]);
    const b = amount(between[3]!, between[4]);
    if (a !== null && b !== null) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const range = new RegExp(String.raw`${MONEY}\s*(?:-|to)\s*${MONEY}`).exec(text);
  if (range) {
    const a = amount(range[1]!, range[2] ?? range[4]);
    const b = amount(range[3]!, range[4]);
    if (a !== null && b !== null && /₹|rs|inr|k\b|budget|rent|under|month/.test(text)) {
      return { min: Math.min(a, b), max: Math.max(a, b) };
    }
  }
  const max = new RegExp(
    String.raw`(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of| is)?|not more than|<)\s*${MONEY}`,
  ).exec(text);
  const min = new RegExp(String.raw`(?:above|over|more than|at least|min(?:imum)?|>)\s*${MONEY}`).exec(text);
  let result = {
    min: min ? amount(min[1]!, min[2]) : null,
    max: max ? amount(max[1]!, max[2]) : null,
  };
  if (result.min === null && result.max === null) {
    // A bare rupee amount ("₹8000", "8k per month") reads as the most they want to pay.
    const bare = new RegExp(String.raw`(?:₹|rs\.?|inr)\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?)?|(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)\b|(\d[\d,]*)\s*(?:\/|per|a)\s*(?:month|mo)\b`).exec(text);
    if (bare) {
      const value = bare[1] ? amount(bare[1], bare[2]) : bare[3] ? amount(bare[3], bare[4]) : amount(bare[5]!, undefined);
      result = { min: null, max: value };
    }
  }
  return result;
}

function findCity(text: string, cities: readonly CityRef[]): string | null {
  for (const [alias, slug] of Object.entries(CITY_ALIASES)) {
    if (new RegExp(`\\b${escape(alias)}\\b`).test(text) && cities.some((c) => c.slug === slug)) return slug;
  }
  for (const city of cities) {
    const names = [city.name.toLowerCase(), city.slug.replace(/-/g, " ")];
    if (names.some((name) => new RegExp(`\\b${escape(name)}\\b`).test(text))) return city.slug;
  }
  return null;
}

function findGender(text: string): "male" | "female" | null {
  if (/\b(girls?|wom[ae]n|ladies|females?)\b/.test(text)) return "female";
  if (/\b(boys?|m[ae]n|gents|males?)\b/.test(text)) return "male";
  return null;
}

export function parseRequirements(input: string, cities: readonly CityRef[]): ParsedRequirements {
  const text = ` ${input.toLowerCase().replace(/\s+/g, " ")} `;

  const gender = findGender(text);
  let types: PropertyType[] = [];
  if (/\bpgs?\b|\bpaying guest\b/.test(text)) {
    types = gender === "female" ? ["pg", "girls_pg"] : gender === "male" ? ["pg", "boys_pg"] : [...PG_TYPES];
  }
  for (const [pattern, values] of TYPE_PATTERNS) {
    if (pattern.test(text)) types.push(...values);
  }
  types = [...new Set(types)].sort();

  const amenities = [...new Set(AMENITY_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, code]) => code))].sort();
  const food = /\b(food|meals?|tiffin|breakfast|dinner|lunch|mess)\b/.test(text) && !/\bwithout (food|meals?)\b|\bno (food|meals?)\b/.test(text);

  const city = findCity(text, cities);
  const budget = findBudget(text);

  let near: string | null = null;
  const nearMatch = /\b(?:near|close to|around|next to)\s+([a-z0-9][a-z0-9 .'-]{1,60}?)(?=\s+(?:in|under|below|with|for|within|budget|and|at)\b|[,.?!]|\s*$)/.exec(
    text,
  );
  if (nearMatch) {
    const candidate = nearMatch[1]!.trim();
    if (candidate && findCity(` ${candidate} `, cities) === null) near = candidate.slice(0, 60);
  }

  const is_search =
    SEARCH_WORDS.test(text) || city !== null || budget.max !== null || types.length > 0 || amenities.length > 0;
  const missing: ParsedRequirements["missing"] = [];
  if (!city) missing.push("city");
  if (budget.max === null && budget.min === null) missing.push("budget");

  return {
    city,
    budget_min: budget.min,
    budget_max: budget.max,
    types,
    food,
    amenities,
    gender,
    near,
    missing,
    is_search,
  };
}

/**
 * Merges the latest message with what earlier user turns already said ("in Pune" then "under
 * 9k"), the latest message winning for every field it mentions.
 */
export function parseConversation(
  latest: string,
  earlierUserMessages: readonly string[],
  cities: readonly CityRef[],
): ParsedRequirements {
  const now = parseRequirements(latest, cities);
  let merged = now;
  for (const previous of [...earlierUserMessages].reverse()) {
    const before = parseRequirements(previous, cities);
    if (!before.is_search) continue;
    merged = {
      city: merged.city ?? before.city,
      budget_min: merged.budget_min ?? (merged.budget_max === null ? before.budget_min : null),
      budget_max: merged.budget_max ?? (merged.budget_min === null ? before.budget_max : null),
      types: merged.types.length > 0 ? merged.types : before.types,
      food: merged.food || before.food,
      amenities: [...new Set([...merged.amenities, ...before.amenities])].sort(),
      gender: merged.gender ?? before.gender,
      near: merged.near ?? before.near,
      missing: [],
      is_search: true,
    };
  }
  const missing: ParsedRequirements["missing"] = [];
  if (!merged.city) missing.push("city");
  if (merged.budget_max === null && merged.budget_min === null) missing.push("budget");
  return { ...merged, missing, is_search: now.is_search || merged.is_search };
}
