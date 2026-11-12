import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/server/env";

import type { AppSupabaseClient } from "./types";

/**
 * Cookieless anonymous client for cacheable public reads (home, search, property detail,
 * reference data) and for public RPCs such as `submit_contact_message`.
 *
 * It never reads cookies or headers, so using it does not make a page dynamic, and every query
 * runs as the `anon` role under RLS. A fresh client is created per call: supabase-js starts an
 * auth promise when a client is constructed, and Next 16 refuses a `"use cache"` scope that awaits
 * a promise created outside it, so a shared singleton would break cached reads. Construction is
 * cheap (no network until the first query).
 */
export function createSupabasePublicClient(): AppSupabaseClient {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
