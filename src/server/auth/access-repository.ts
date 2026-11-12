import "server-only";

import type { AccountStatus, UserRole } from "@/lib/constants";
import type { Database } from "@/lib/database.types";
import { fromSupabaseError } from "@/server/http/errors";
import type { AppSupabaseClient } from "@/server/supabase/types";

export type AccessRow = {
  id: string;
  email: string | null;
  status: AccountStatus;
  intent: Database["public"]["Enums"]["user_intent"] | null;
  onboarding_completed_at: string | null;
  roles: UserRole[];
};

/**
 * The caller's own account state and roles in ONE query, through the caller's session: RLS
 * lets a user read only their own `users` row and their own `user_roles` rows, so nothing here
 * depends on JWT metadata or on anything the client sent. Returns null when the row is missing
 * (auth user without a `users` row, or not signed in).
 */
export async function fetchAccessRow(supabase: AppSupabaseClient, userId: string): Promise<AccessRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, email, status, intent, onboarding_completed_at, user_roles!user_roles_user_id_fkey(role)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw fromSupabaseError(error);
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    status: data.status,
    intent: data.intent,
    onboarding_completed_at: data.onboarding_completed_at,
    roles: (data.user_roles ?? []).map((row) => row.role),
  };
}
