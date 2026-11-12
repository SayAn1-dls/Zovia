import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { PublicServiceContext } from "@/server/auth/context";
import { env } from "@/server/env";

/**
 * A cookieless anon client created INSIDE a `"use cache"` scope.
 *
 * Why not `publicServiceContext()`: it returns a module-level singleton, and supabase-js starts
 * an auth initialisation promise when the client is constructed. A cached function that awaits a
 * promise created outside its scope is refused by Next 16 ("A "use cache" function is awaiting a
 * promise created outside it"). A fresh client per cache fill avoids that; cache fills are rare,
 * so the cost is negligible. Same role (anon), same RLS, no session, no cookies.
 *
 * Foundation follow-up: let `publicServiceContext()` / `createSupabasePublicClient()` return a
 * fresh client inside cached scopes, then delete this file.
 */
export function cacheScopedPublicContext(): PublicServiceContext {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  const supabase = createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { supabase, user: null, requestId: "public" };
}
