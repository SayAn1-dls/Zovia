import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

import type { LifestyleQuestion } from "./schemas";

/**
 * Roommate data, always through the caller's own session. RLS limits profile rows, answers,
 * deal-breakers and preferences to their owner; everything that crosses users goes through the
 * SECURITY DEFINER functions (roommate_candidates, roommate_profile_cards, roommate_swipe,
 * roommate_unmatch, block_user).
 */

type Tables = Database["public"]["Tables"];
type ProfileRow = Tables["roommate_profiles"]["Row"];
type ProfileInsert = Tables["roommate_profiles"]["Insert"];
type ProfileUpdate = Tables["roommate_profiles"]["Update"];
type PreferencesRow = Tables["roommate_preferences"]["Row"];
type PlaceRow = Tables["roommate_places"]["Row"];
type PlaceInsert = Tables["roommate_places"]["Insert"];

export const ROOMMATE_PHOTOS_BUCKET = "roommate-photos";

export type OwnBundle = {
  profile: ProfileRow | null;
  preferences: PreferencesRow | null;
  place: PlaceRow | null;
  answers: { question_code: string; value: number }[];
  deal_breakers: string[];
  photos: { id: string; storage_path: string; position: number }[];
};

export async function fetchOwnBundle(supabase: AppSupabaseClient, userId: string): Promise<OwnBundle> {
  const [profile, preferences, place, answers, dealBreakers, photos] = await Promise.all([
    supabase.from("roommate_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("roommate_preferences").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("roommate_places").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("roommate_lifestyle_answers").select("question_code, value").eq("user_id", userId),
    supabase.from("roommate_deal_breakers").select("code").eq("user_id", userId),
    supabase
      .from("roommate_profile_photos")
      .select("id, storage_path, position")
      .eq("user_id", userId)
      .order("position")
      .order("created_at"),
  ]);
  for (const result of [profile, preferences, place, answers, dealBreakers, photos]) {
    if (result.error) throw fromSupabaseError(result.error);
  }
  return {
    profile: profile.data,
    preferences: preferences.data,
    place: place.data,
    answers: answers.data ?? [],
    deal_breakers: (dealBreakers.data ?? []).map((row) => row.code),
    photos: photos.data ?? [],
  };
}

export async function fetchProfileStatus(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<Database["public"]["Enums"]["roommate_profile_status"] | null> {
  const { data, error } = await supabase.from("roommate_profiles").select("status").eq("user_id", userId).maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data?.status ?? null;
}

/** Insert or update without touching user_id (no UPDATE grant on it, so no PostgREST upsert). */
export async function saveProfile(
  supabase: AppSupabaseClient,
  userId: string,
  values: Omit<ProfileInsert, "user_id">,
): Promise<void> {
  const exists = (await fetchProfileStatus(supabase, userId)) !== null;
  if (exists) {
    const { error } = await supabase.from("roommate_profiles").update(values as ProfileUpdate).eq("user_id", userId);
    if (error) throw fromSupabaseError(error);
  } else {
    const { error } = await supabase.from("roommate_profiles").insert({ ...values, user_id: userId });
    if (error) throw fromSupabaseError(error);
  }
}

export async function updateProfileStatus(
  supabase: AppSupabaseClient,
  userId: string,
  status: Database["public"]["Enums"]["roommate_profile_status"],
): Promise<boolean> {
  const { data, error } = await supabase
    .from("roommate_profiles")
    .update({ status })
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw fromSupabaseError(error);
  return (data ?? []).length > 0;
}

export async function savePreferences(
  supabase: AppSupabaseClient,
  userId: string,
  values: Omit<Tables["roommate_preferences"]["Insert"], "user_id">,
): Promise<void> {
  const existing = await supabase.from("roommate_preferences").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing.error) throw fromSupabaseError(existing.error);
  const { error } = existing.data
    ? await supabase.from("roommate_preferences").update(values).eq("user_id", userId)
    : await supabase.from("roommate_preferences").insert({ ...values, user_id: userId });
  if (error) throw fromSupabaseError(error);
}

/** Replaces the caller's answers with `answers` (codes not listed are removed). */
export async function replaceAnswers(
  supabase: AppSupabaseClient,
  userId: string,
  answers: Record<string, number>,
): Promise<void> {
  const del = await supabase.from("roommate_lifestyle_answers").delete().eq("user_id", userId);
  if (del.error) throw fromSupabaseError(del.error);
  const rows = Object.entries(answers).map(([question_code, value]) => ({ user_id: userId, question_code, value }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("roommate_lifestyle_answers").insert(rows);
  if (error) throw fromSupabaseError(error);
}

export async function replaceDealBreakers(supabase: AppSupabaseClient, userId: string, codes: string[]): Promise<void> {
  const del = await supabase.from("roommate_deal_breakers").delete().eq("user_id", userId);
  if (del.error) throw fromSupabaseError(del.error);
  if (codes.length === 0) return;
  const { error } = await supabase.from("roommate_deal_breakers").insert(codes.map((code) => ({ user_id: userId, code })));
  if (error) throw fromSupabaseError(error);
}

export async function savePlace(
  supabase: AppSupabaseClient,
  userId: string,
  values: Omit<PlaceInsert, "user_id"> | null,
): Promise<void> {
  if (values === null) {
    const { error } = await supabase.from("roommate_places").delete().eq("user_id", userId);
    if (error) throw fromSupabaseError(error);
    return;
  }
  const existing = await supabase.from("roommate_places").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing.error) throw fromSupabaseError(existing.error);
  const { error } = existing.data
    ? await supabase.from("roommate_places").update(values).eq("user_id", userId)
    : await supabase.from("roommate_places").insert({ ...values, user_id: userId });
  if (error) throw fromSupabaseError(error);
}

export async function listQuestions(supabase: AppSupabaseClient): Promise<LifestyleQuestion[]> {
  const { data, error } = await supabase
    .from("lifestyle_questions")
    .select("code, factor, prompt, kind, options, position")
    .eq("is_active", true)
    .order("position");
  if (error) throw fromSupabaseError(error);
  return (data ?? []).map((row) => ({
    code: row.code,
    factor: row.factor,
    prompt: row.prompt,
    kind: row.kind === "scale" ? "scale" : "choice",
    position: row.position,
    options: Array.isArray(row.options)
      ? row.options.flatMap((option) => {
          if (option && typeof option === "object" && !Array.isArray(option)) {
            const value = Number((option as Record<string, unknown>).value);
            const label = (option as Record<string, unknown>).label;
            if (Number.isInteger(value) && typeof label === "string") return [{ value, label }];
          }
          return [];
        })
      : [],
  }));
}

export async function listWeights(supabase: AppSupabaseClient): Promise<{ factor: string; weight: number }[]> {
  const { data, error } = await supabase.from("compatibility_weights").select("factor, weight");
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function callCandidates(supabase: AppSupabaseClient, limit: number): Promise<unknown[]> {
  const { data, error } = await supabase.rpc("roommate_candidates", { p_limit: limit });
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function callProfileCards(supabase: AppSupabaseClient, userIds: string[]): Promise<unknown[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase.rpc("roommate_profile_cards", { p_user_ids: userIds });
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function callSwipe(
  supabase: AppSupabaseClient,
  targetId: string,
  action: Database["public"]["Enums"]["swipe_action"],
): Promise<unknown> {
  const { data, error } = await supabase.rpc("roommate_swipe", { p_target: targetId, p_action: action });
  if (error) throw fromSupabaseError(error);
  return data;
}

export type MatchRow = Pick<
  Tables["roommate_matches"]["Row"],
  "id" | "user_a" | "user_b" | "status" | "matched_at" | "conversation_id"
>;

export async function listMatches(supabase: AppSupabaseClient, userId: string): Promise<MatchRow[]> {
  const { data, error } = await supabase
    .from("roommate_matches")
    .select("id, user_a, user_b, status, matched_at, conversation_id")
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .eq("status", "active")
    .order("matched_at", { ascending: false })
    .limit(100);
  if (error) throw fromSupabaseError(error);
  return data ?? [];
}

export async function fetchMatch(supabase: AppSupabaseClient, matchId: string): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from("roommate_matches")
    .select("id, user_a, user_b, status, matched_at, conversation_id")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function callUnmatch(supabase: AppSupabaseClient, matchId: string): Promise<void> {
  const { error } = await supabase.rpc("roommate_unmatch", { p_match_id: matchId });
  if (error) throw fromSupabaseError(error);
}

export async function fetchPublicNames(
  supabase: AppSupabaseClient,
  userIds: string[],
): Promise<Map<string, { display_name: string | null; avatar_path: string | null }>> {
  const map = new Map<string, { display_name: string | null; avatar_path: string | null }>();
  if (userIds.length === 0) return map;
  const { data, error } = await supabase
    .from("public_user_cards")
    .select("user_id, display_name, avatar_path")
    .in("user_id", userIds);
  if (error) throw fromSupabaseError(error);
  for (const row of data ?? []) {
    if (row.user_id) map.set(row.user_id, { display_name: row.display_name, avatar_path: row.avatar_path });
  }
  return map;
}

// ───────────────────────────── photos ─────────────────────────────

export async function insertPhoto(
  supabase: AppSupabaseClient,
  userId: string,
  storagePath: string,
  position: number,
): Promise<{ id: string; storage_path: string; position: number }> {
  const { data, error } = await supabase
    .from("roommate_profile_photos")
    .insert({ user_id: userId, storage_path: storagePath, position })
    .select("id, storage_path, position")
    .single();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function deletePhoto(supabase: AppSupabaseClient, userId: string, photoId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("roommate_profile_photos")
    .delete()
    .eq("id", photoId)
    .eq("user_id", userId)
    .select("storage_path");
  if (error) throw fromSupabaseError(error);
  return data?.[0]?.storage_path ?? null;
}

export async function countPhotos(supabase: AppSupabaseClient, userId: string): Promise<number> {
  const { count, error } = await supabase
    .from("roommate_profile_photos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw fromSupabaseError(error);
  return count ?? 0;
}

export async function storageObjectExists(supabase: AppSupabaseClient, bucket: string, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: name, limit: 5 });
  if (error) throw fromSupabaseError(error);
  return (data ?? []).some((item) => item.name === name);
}

export async function removeStorageObject(supabase: AppSupabaseClient, bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw fromSupabaseError(error);
}

/** Signed URLs (path -> url) for objects the caller may read; unreadable paths are left out. */
export async function signUrls(
  supabase: AppSupabaseClient,
  bucket: string,
  paths: string[],
  expiresInSeconds: number,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return map;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(unique, expiresInSeconds);
  if (error) throw fromSupabaseError(error);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) map.set(item.path, item.signedUrl);
  }
  return map;
}

export async function cacheResults(
  supabase: AppSupabaseClient,
  rows: Tables["compatibility_results"]["Insert"][],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from("compatibility_results")
    .upsert(rows, { onConflict: "viewer_id,candidate_id" });
  if (error) throw fromSupabaseError(error);
}
