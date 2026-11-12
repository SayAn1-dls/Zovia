import "server-only";

import { getOwnProfile as getAccountProfile, listCities as listAccountCities } from "@/features/account/service";
import { blockUser } from "@/features/moderation/service";
import type { ServiceContext, UserServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";
import { errors } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

import { rankDeck, summarise, toEngineCard, toPublicCard, weightsFromRows } from "./cards";
import { computeCompatibility, type CompatibilityWeights } from "./compatibility";
import * as repo from "./repository";
import {
  cardRowSchema,
  ROOMMATE_PHOTO_LIMIT,
  type CardRow,
  type City,
  type DeckCandidate,
  type LifestyleQuestion,
  type MatchItem,
  type OwnRoommateProfile,
  type PublicRoommateCard,
  type RoommateProfileInput,
  type RoommateProfileStatus,
  type SwipeInput,
  type SwipeResult,
} from "./schemas";

const SIGNED_URL_SECONDS = 60 * 60;
const POOL_SIZE = 150;
const DECK_SIZE = 20;
const PHOTOS_PER_CARD = 4;

/** Public URL of an object in the public `avatars` bucket (spec 6.8). */
function avatarUrl(path: string | null): string | null {
  if (!path) return null;
  const base = env().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function parseCards(raw: unknown[], log: (msg: string) => void): CardRow[] {
  const rows: CardRow[] = [];
  for (const item of raw) {
    const parsed = cardRowSchema.safeParse(item);
    if (parsed.success) rows.push(parsed.data);
    else log("roommates.card_parse_failed");
  }
  return rows;
}

async function presentCards(ctx: ServiceContext, rows: CardRow[]): Promise<Map<string, PublicRoommateCard>> {
  const paths = rows.flatMap((row) => row.photos.slice(0, PHOTOS_PER_CARD));
  const urls = await repo.signUrls(ctx.supabase, repo.ROOMMATE_PHOTOS_BUCKET, paths, SIGNED_URL_SECONDS);
  const out = new Map<string, PublicRoommateCard>();
  for (const row of rows) {
    out.set(
      row.user_id,
      toPublicCard(row, {
        avatar_url: avatarUrl(row.avatar_path),
        photo_urls: row.photos
          .slice(0, PHOTOS_PER_CARD)
          .map((path) => urls.get(path))
          .filter((url): url is string => typeof url === "string"),
      }),
    );
  }
  return out;
}

async function loadWeights(ctx: ServiceContext): Promise<CompatibilityWeights> {
  const { weights, valid, errors: problems } = weightsFromRows(await repo.listWeights(ctx.supabase));
  if (!valid) {
    logger.warn("roommates.weights_invalid_using_defaults", { request_id: ctx.requestId, problems });
  }
  return weights;
}

async function ownCard(ctx: UserServiceContext): Promise<CardRow | null> {
  const [row] = parseCards(await repo.callProfileCards(ctx.supabase, [ctx.user.id]), () => undefined);
  return row ?? null;
}

// ───────────────────────────── reference data ─────────────────────────────

export async function listQuestions(ctx: ServiceContext): Promise<LifestyleQuestion[]> {
  return repo.listQuestions(ctx.supabase);
}

export async function listCities(ctx: ServiceContext): Promise<City[]> {
  return listAccountCities(ctx);
}

// ───────────────────────────── own profile ─────────────────────────────

export async function getProfileStatus(ctx: UserServiceContext): Promise<RoommateProfileStatus | null> {
  return repo.fetchProfileStatus(ctx.supabase, ctx.user.id);
}

/** The caller's roommate profile as form values; prefilled from their account when new. */
export async function getOwnProfile(ctx: UserServiceContext): Promise<OwnRoommateProfile> {
  const bundle = await repo.fetchOwnBundle(ctx.supabase, ctx.user.id);
  const { profile, preferences, place } = bundle;
  const urls = await repo.signUrls(
    ctx.supabase,
    repo.ROOMMATE_PHOTOS_BUCKET,
    bundle.photos.map((photo) => photo.storage_path),
    SIGNED_URL_SECONDS,
  );
  const photos = bundle.photos.map((photo) => ({
    id: photo.id,
    storage_path: photo.storage_path,
    url: urls.get(photo.storage_path) ?? null,
  }));

  if (!profile) {
    const account = await getAccountProfile(ctx);
    const cities = await listAccountCities(ctx);
    const city =
      cities.find((c) => [c.name.toLowerCase(), c.slug].includes((account.preferred_city ?? "").toLowerCase()))?.name ?? "";
    return {
      exists: false,
      status: "draft",
      photos,
      values: {
        headline: "",
        about: account.bio ?? "",
        age: "",
        gender: account.gender ?? "",
        occupation: account.occupation ?? "",
        occupation_detail:
          account.occupation === "student"
            ? (account.college_name ?? "")
            : account.occupation === "working_professional"
              ? (account.company ?? "")
              : "",
        city,
        preferred_localities: account.preferred_localities,
        budget_min: "",
        budget_max: "",
        move_in_date: "",
        has_place: account.intent === "have_place_need_roommate",
        place: null,
        preferred_genders: [],
        age_min: "",
        age_max: "",
        occupation_prefs: [],
        answers: {},
        deal_breakers: [],
        status: "active",
      },
    };
  }

  return {
    exists: true,
    status: profile.status,
    photos,
    values: {
      headline: profile.headline ?? "",
      about: profile.about ?? "",
      age: profile.age ?? "",
      gender: profile.gender ?? "",
      occupation: profile.occupation ?? "",
      occupation_detail: profile.occupation_detail ?? "",
      city: profile.city ?? "",
      preferred_localities: profile.preferred_localities,
      budget_min: profile.budget_min ?? "",
      budget_max: profile.budget_max ?? "",
      move_in_date: profile.move_in_date ?? "",
      has_place: profile.has_place,
      place: place
        ? {
            title: place.title,
            description: place.description ?? "",
            locality: place.locality ?? "",
            rent_share: place.rent_share ?? "",
            deposit_share: place.deposit_share ?? "",
            vacancies: place.vacancies ?? "",
            available_from: place.available_from ?? "",
            furnishing: place.furnishing ?? "",
          }
        : null,
      preferred_genders: preferences?.preferred_genders ?? [],
      age_min: preferences?.age_min ?? "",
      age_max: preferences?.age_max ?? "",
      occupation_prefs: preferences?.occupation_prefs ?? [],
      answers: Object.fromEntries(bundle.answers.map((answer) => [answer.question_code, answer.value])),
      deal_breakers: bundle.deal_breakers as OwnRoommateProfile["values"]["deal_breakers"],
      status: profile.status === "draft" ? "active" : profile.status,
    },
  };
}

/**
 * Saves the whole profile. The profile row goes first (as a draft when it is new, so the
 * dependent rows have their parent), then preferences, answers, deal-breakers and place, and the
 * requested status last: a failure part-way leaves a profile that is not live, and the person
 * can simply save again (every step is an idempotent replace of their own rows).
 */
export async function saveOwnProfile(
  ctx: UserServiceContext,
  input: RoommateProfileInput,
): Promise<{ status: RoommateProfileStatus }> {
  const questions = await repo.listQuestions(ctx.supabase);
  const valid = new Map(questions.map((q) => [q.code, new Set(q.options.map((o) => o.value))]));
  const answers: Record<string, number> = {};
  for (const [code, value] of Object.entries(input.answers)) {
    if (!valid.get(code)?.has(value)) {
      throw errors.validation({ formErrors: [], fieldErrors: { [`answers.${code}`]: ["Choose one of the options."] } });
    }
    answers[code] = value;
  }

  const current = await repo.fetchProfileStatus(ctx.supabase, ctx.user.id);
  await repo.saveProfile(ctx.supabase, ctx.user.id, {
    status: current ?? "draft",
    headline: input.headline,
    about: input.about,
    age: input.age,
    gender: input.gender,
    occupation: input.occupation,
    occupation_detail: input.occupation_detail,
    city: input.city,
    preferred_localities: input.preferred_localities,
    budget_min: input.budget_min,
    budget_max: input.budget_max,
    move_in_date: input.move_in_date,
    has_place: input.has_place,
  });
  await repo.savePreferences(ctx.supabase, ctx.user.id, {
    preferred_genders: input.preferred_genders,
    age_min: input.age_min,
    age_max: input.age_max,
    occupation_prefs: input.occupation_prefs,
  });
  await repo.replaceAnswers(ctx.supabase, ctx.user.id, answers);
  await repo.replaceDealBreakers(ctx.supabase, ctx.user.id, input.deal_breakers);
  await repo.savePlace(
    ctx.supabase,
    ctx.user.id,
    input.has_place && input.place
      ? {
          title: input.place.title,
          description: input.place.description,
          locality: input.place.locality,
          city: input.city,
          rent_share: input.place.rent_share,
          deposit_share: input.place.deposit_share,
          vacancies: input.place.vacancies ?? 1,
          available_from: input.place.available_from,
          furnishing: input.place.furnishing,
        }
      : null,
  );
  const status: RoommateProfileStatus = input.status;
  if (status !== (current ?? "draft")) await repo.updateProfileStatus(ctx.supabase, ctx.user.id, status);
  return { status };
}

export async function setProfileStatus(
  ctx: UserServiceContext,
  status: "active" | "paused",
): Promise<{ status: RoommateProfileStatus }> {
  const updated = await repo.updateProfileStatus(ctx.supabase, ctx.user.id, status);
  if (!updated) throw errors.notFound("Create your roommate profile first.");
  return { status };
}

// ───────────────────────────── photos ─────────────────────────────

export async function addPhoto(
  ctx: UserServiceContext,
  storagePath: string,
): Promise<{ id: string; storage_path: string; url: string | null }> {
  if (!storagePath.startsWith(`${ctx.user.id}/`)) throw errors.forbidden("You can only add your own photos.");
  if ((await repo.fetchProfileStatus(ctx.supabase, ctx.user.id)) === null) {
    throw errors.conflict("Save your profile before adding photos.");
  }
  const count = await repo.countPhotos(ctx.supabase, ctx.user.id);
  if (count >= ROOMMATE_PHOTO_LIMIT) throw errors.conflict(`You can add up to ${ROOMMATE_PHOTO_LIMIT} photos.`);
  if (!(await repo.storageObjectExists(ctx.supabase, repo.ROOMMATE_PHOTOS_BUCKET, storagePath))) {
    throw errors.validation({ formErrors: ["Upload the photo first."], fieldErrors: {} }, "Upload the photo first.");
  }
  const photo = await repo.insertPhoto(ctx.supabase, ctx.user.id, storagePath, count);
  const urls = await repo.signUrls(ctx.supabase, repo.ROOMMATE_PHOTOS_BUCKET, [photo.storage_path], SIGNED_URL_SECONDS);
  return { id: photo.id, storage_path: photo.storage_path, url: urls.get(photo.storage_path) ?? null };
}

export async function removePhoto(ctx: UserServiceContext, photoId: string): Promise<void> {
  const path = await repo.deletePhoto(ctx.supabase, ctx.user.id, photoId);
  if (!path) throw errors.notFound("Photo not found.");
  try {
    await repo.removeStorageObject(ctx.supabase, repo.ROOMMATE_PHOTOS_BUCKET, path);
  } catch (error) {
    // The row is gone, so the photo is no longer shown; the orphaned object is only logged.
    logger.warn("roommates.photo_object_not_removed", { request_id: ctx.requestId, error: serializeError(error) });
  }
}

// ───────────────────────────── deck ─────────────────────────────

export type DeckState =
  | { state: "no_profile" | "draft" | "paused" }
  | { state: "active"; city: string | null; candidates: DeckCandidate[] };

/** The caller's ranked deck: candidate pool from SQL, deal-breakers and scoring by the engine. */
export async function getDeck(ctx: UserServiceContext, limit = DECK_SIZE): Promise<DeckState> {
  const status = await repo.fetchProfileStatus(ctx.supabase, ctx.user.id);
  if (status === null) return { state: "no_profile" };
  if (status !== "active") return { state: status };

  const log = (msg: string) => logger.warn(msg, { request_id: ctx.requestId });
  const [me, pool, weights] = await Promise.all([
    ownCard(ctx),
    repo.callCandidates(ctx.supabase, POOL_SIZE).then((raw) => parseCards(raw, log)),
    loadWeights(ctx),
  ]);
  if (!me) throw errors.notFound("Create your roommate profile first.");

  const ranked = rankDeck(me, pool, weights, Math.min(Math.max(limit, 1), 50));
  const cards = await presentCards(
    ctx,
    ranked.map((entry) => entry.row),
  );

  try {
    await repo.cacheResults(
      ctx.supabase,
      ranked.map(({ row, result }) => ({
        viewer_id: ctx.user.id,
        candidate_id: row.user_id,
        score: result.score,
        breakdown: JSON.parse(JSON.stringify(result.breakdown)),
        shared: result.shared,
        conflicts: result.conflicts,
        algorithm_version: result.algorithm_version,
        computed_at: new Date().toISOString(),
      })),
    );
  } catch (error) {
    // The cache is an optimisation; the deck is still correct without it.
    logger.warn("roommates.cache_results_failed", { request_id: ctx.requestId, error: serializeError(error) });
  }

  return {
    state: "active",
    city: me.city,
    candidates: ranked.flatMap(({ row, result }) => {
      const card = cards.get(row.user_id);
      return card ? [{ ...card, compatibility: summarise(result) }] : [];
    }),
  };
}

export async function swipe(ctx: UserServiceContext, input: SwipeInput): Promise<SwipeResult> {
  const raw = (await repo.callSwipe(ctx.supabase, input.target_id, input.action)) as Partial<SwipeResult> | null;
  return {
    matched: raw?.matched === true,
    new_match: raw?.new_match === true,
    match_id: typeof raw?.match_id === "string" ? raw.match_id : null,
    conversation_id: typeof raw?.conversation_id === "string" ? raw.conversation_id : null,
  };
}

// ───────────────────────────── matches ─────────────────────────────

export async function listMatches(ctx: UserServiceContext): Promise<MatchItem[]> {
  const rows = await repo.listMatches(ctx.supabase, ctx.user.id);
  const otherIds = rows.map((row) => (row.user_a === ctx.user.id ? row.user_b : row.user_a));
  const [cardRows, names, weights, me] = await Promise.all([
    repo.callProfileCards(ctx.supabase, otherIds).then((raw) => parseCards(raw, () => undefined)),
    repo.fetchPublicNames(ctx.supabase, otherIds),
    loadWeights(ctx),
    ownCard(ctx),
  ]);
  const byId = new Map(cardRows.map((row) => [row.user_id, row]));
  const presented = await presentCards(ctx, cardRows);

  return rows.map((row) => {
    const otherId = row.user_a === ctx.user.id ? row.user_b : row.user_a;
    const card = byId.get(otherId);
    return {
      id: row.id,
      status: row.status,
      matched_at: row.matched_at,
      conversation_id: row.conversation_id,
      person: presented.get(otherId) ?? null,
      fallback_name: names.get(otherId)?.display_name ?? "Member",
      compatibility: card && me ? summarise(computeCompatibility(toEngineCard(me), toEngineCard(card), weights)) : null,
    };
  });
}

export async function unmatch(ctx: UserServiceContext, matchId: string): Promise<void> {
  await repo.callUnmatch(ctx.supabase, matchId);
}

/** Blocks the other person of one of the caller's matches. The target comes from the match row, never the client. */
export async function blockMatch(ctx: UserServiceContext, matchId: string): Promise<void> {
  const match = await repo.fetchMatch(ctx.supabase, matchId);
  if (!match || (match.user_a !== ctx.user.id && match.user_b !== ctx.user.id)) throw errors.notFound("Match not found.");
  await blockUser(ctx, match.user_a === ctx.user.id ? match.user_b : match.user_a);
}
