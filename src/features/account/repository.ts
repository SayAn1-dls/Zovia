import "server-only";

import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient, Database } from "@/server/supabase/types";

import type { City, OwnProfile } from "./schemas";

/**
 * Account data, always through the caller's own session: RLS limits `users`, `user_profiles`
 * and `user_preferences` to the caller's own rows, and column grants limit what may be written
 * (status, e-mail and roles cannot be written from here at all).
 */

type ProfileUpdate = Database["public"]["Tables"]["user_profiles"]["Update"];
type PreferencesUpdate = Database["public"]["Tables"]["user_preferences"]["Update"];
type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export async function fetchOwnProfile(supabase: AppSupabaseClient, userId: string): Promise<OwnProfile | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      `email, intent,
       user_profiles!inner(display_name, gender, occupation, college_name, course, academic_year, work_location,
         company, industry, work_schedule, home_city, bio, avatar_path),
       user_preferences!inner(preferred_city, preferred_localities)`,
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  if (!data) return null;
  const { user_profiles: profile, user_preferences: preferences } = data;
  return {
    email: data.email,
    intent: data.intent,
    display_name: profile.display_name,
    gender: profile.gender,
    occupation: profile.occupation,
    college_name: profile.college_name,
    course: profile.course,
    academic_year: profile.academic_year,
    work_location: profile.work_location,
    company: profile.company,
    industry: profile.industry,
    work_schedule: profile.work_schedule,
    home_city: profile.home_city,
    bio: profile.bio,
    preferred_city: preferences.preferred_city,
    preferred_localities: preferences.preferred_localities,
  };
}

export async function fetchDisplayCard(
  supabase: AppSupabaseClient,
  userId: string,
): Promise<{ display_name: string; avatar_path: string | null } | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("display_name, avatar_path")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function listActiveCities(supabase: AppSupabaseClient): Promise<City[]> {
  const { data, error } = await supabase.from("cities").select("slug, name").eq("is_active", true).order("name");
  if (error) throw fromSupabaseError(error);
  return data;
}

export async function updateProfile(supabase: AppSupabaseClient, userId: string, values: ProfileUpdate): Promise<void> {
  const { error } = await supabase.from("user_profiles").update(values).eq("user_id", userId);
  if (error) throw fromSupabaseError(error);
}

export async function updatePreferences(
  supabase: AppSupabaseClient,
  userId: string,
  values: PreferencesUpdate,
): Promise<void> {
  const { error } = await supabase.from("user_preferences").update(values).eq("user_id", userId);
  if (error) throw fromSupabaseError(error);
}

export async function updateUser(supabase: AppSupabaseClient, userId: string, values: UserUpdate): Promise<void> {
  const { error } = await supabase.from("users").update(values).eq("id", userId);
  if (error) throw fromSupabaseError(error);
}
