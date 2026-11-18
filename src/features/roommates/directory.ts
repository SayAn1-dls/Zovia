import type { Route } from "next";
import { z } from "zod";

import { GENDERS } from "@/features/account/schemas";

/**
 * Roommate directory contracts and pure helpers (isomorphic, no I/O). The database decides who is
 * listed and which fields leave it (roommate_directory() in 20261120000500); this file only
 * parses that allow-listed card, turns lifestyle answers into short tags and builds page links.
 */

export const DIRECTORY_PAGE_SIZE = 24;
/** roommate_directory() refuses offsets past 10,000. */
export const DIRECTORY_MAX_PAGE = Math.floor(10_000 / DIRECTORY_PAGE_SIZE) + 1;
export const DIRECTORY_PATH = "/roommates/directory" as Route;

// ───────────────────────────── filters (from the URL) ─────────────────────────────

const firstValue = (value: unknown) => (Array.isArray(value) ? value[0] : value);

/** URL search params -> directory filters. Anything unexpected falls back to "no filter". */
export const directoryQuerySchema = z.object({
  city: z.preprocess(
    firstValue,
    z
      .string()
      .trim()
      .max(80)
      .transform((value) => (value === "" ? null : value))
      .nullable()
      .catch(null)
      .default(null),
  ),
  available: z.preprocess(
    firstValue,
    z
      .enum(["yes", "no"])
      .transform((value) => value === "yes")
      .nullable()
      .catch(null)
      .default(null),
  ),
  page: z.preprocess(
    firstValue,
    z.coerce.number().int().min(1).max(DIRECTORY_MAX_PAGE).catch(1).default(1),
  ),
});
export type DirectoryQuery = z.output<typeof directoryQuerySchema>;

export function parseDirectoryQuery(params: Record<string, string | string[] | undefined>): DirectoryQuery {
  return directoryQuerySchema.parse(params);
}

export function directoryOffset(page: number): number {
  return (Math.min(Math.max(Math.trunc(page) || 1, 1), DIRECTORY_MAX_PAGE) - 1) * DIRECTORY_PAGE_SIZE;
}

/** Link to a directory page with the given filters; default values are left out of the URL. */
export function directoryHref(query: Partial<DirectoryQuery>): Route {
  const params = new URLSearchParams();
  if (query.city) params.set("city", query.city);
  if (query.available === true) params.set("available", "yes");
  if (query.available === false) params.set("available", "no");
  if (query.page && query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return (search ? `${DIRECTORY_PATH}?${search}` : DIRECTORY_PATH) as Route;
}

// ───────────────────────────── rows from the database ─────────────────────────────

const nullableString = z.string().nullable().catch(null);
const nullableInt = z.number().int().nullable().catch(null);

/** One card as returned (jsonb) by roommate_directory(). age/gender are absent unless the owner shows them. */
export const directoryRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().catch("Member"),
  city: nullableString,
  preferred_localities: z.array(z.string()).catch([]),
  budget_min: nullableInt,
  budget_max: nullableInt,
  move_in_date: nullableString,
  available: z.boolean().catch(false),
  lifestyle: z.record(z.string(), z.number()).catch({}),
  photo_path: nullableString.optional().transform((value) => value ?? null),
  age: nullableInt.optional().transform((value) => value ?? null),
  gender: z.enum(GENDERS).nullable().catch(null).optional().transform((value) => value ?? null),
});
export type DirectoryRow = z.infer<typeof directoryRowSchema>;

export const directoryPageSchema = z.object({
  items: z.array(z.unknown()).catch([]),
  has_more: z.boolean().catch(false),
});

// ───────────────────────────── DTO sent to the browser ─────────────────────────────

export type DirectoryCard = {
  user_id: string;
  display_name: string;
  /** null when the owner keeps age and gender to themselves. */
  age: number | null;
  gender: DirectoryRow["gender"];
  city: string | null;
  preferred_localities: string[];
  budget_min: number | null;
  budget_max: number | null;
  move_in_date: string | null;
  available: boolean;
  tags: string[];
  photo_url: string | null;
};

export type DirectoryPage = {
  items: DirectoryCard[];
  page: number;
  has_more: boolean;
  /** The viewer has a live profile, so Like goes straight into the like -> match -> chat flow. */
  can_like: boolean;
};

// ───────────────────────────── lifestyle tags ─────────────────────────────

/**
 * Short tags for the allow-listed questions (codes and option values match
 * 20261112000400_roommate_tables.sql). Order here is the order on the card.
 */
const TAGS: Record<string, Record<number, string>> = {
  food_habit: { 1: "Vegetarian", 2: "Eggetarian", 3: "Non-veg", 4: "Vegan" },
  smoking: { 1: "Non-smoker", 2: "Smokes outside", 3: "Smoker" },
  drinking: { 1: "Doesn't drink", 2: "Drinks socially", 3: "Drinks regularly" },
  sleep_schedule: { 1: "Early bird", 2: "Sleeps before midnight", 3: "Sleeps around midnight", 4: "Late sleeper", 5: "Night owl" },
  cleanliness: { 1: "Very relaxed about mess", 2: "Relaxed about mess", 3: "Tidy enough", 4: "Clean", 5: "Spotless" },
  pets: { 1: "Has a pet", 2: "Loves pets", 3: "Prefers no pets", 4: "Allergic to pets" },
};

export function lifestyleTags(lifestyle: Record<string, number>): string[] {
  const tags: string[] = [];
  for (const [code, labels] of Object.entries(TAGS)) {
    const value = lifestyle[code];
    const label = value === undefined ? undefined : labels[value];
    if (label) tags.push(label);
  }
  return tags;
}

export function toDirectoryCard(row: DirectoryRow, photoUrl: string | null): DirectoryCard {
  return {
    user_id: row.user_id,
    display_name: row.display_name,
    age: row.age,
    gender: row.gender,
    city: row.city,
    preferred_localities: row.preferred_localities,
    budget_min: row.budget_min,
    budget_max: row.budget_max,
    move_in_date: row.move_in_date,
    available: row.available,
    tags: lifestyleTags(row.lifestyle),
    photo_url: photoUrl,
  };
}
