import "server-only";

import { connection } from "next/server";
import { cache } from "react";

import { createSupabaseServerClient } from "@/server/supabase/server";
import type { AppSupabaseClient } from "@/server/supabase/types";

import { fetchAccessRow, type AccessRow } from "./access-repository";

/**
 * How the user is verified
 * ------------------------
 * `supabase.auth.getClaims()` (the method @supabase/ssr 0.12 recommends for servers):
 *  - refreshes the cookie session when the access token has expired;
 *  - verifies the JWT signature. This project signs user tokens with ES256, so verification is
 *    local against the project's published JWKS (fetched once and cached); for a legacy HS256
 *    project the library falls back to asking the Auth server (`getUser`). There is no shared
 *    JWT secret in this application and none is needed.
 * `auth.getSession()` is never used for authorisation: it only decodes the cookie.
 *
 * The verified claim we use is `sub` (the user id) and nothing else. Roles, status and
 * onboarding state come from the database through the user's own session (RLS), never from
 * `user_metadata` / `app_metadata`. A revoked or suspended account is therefore caught by the
 * database read (and by RLS on every query) even while its access token is still valid.
 */

export type Session = {
  /** User-scoped client for this request (anon role when `userId` is null). */
  supabase: AppSupabaseClient;
  /** Verified user id, or null when signed out. */
  userId: string | null;
};

/** The signed-in account as the server sees it. `snake_case` fields are database columns. */
export type CurrentUser = AccessRow;

/**
 * Verified session for this request. Memoised per render with React `cache`, so layouts, pages
 * and components can all call it; in Route Handlers and Server Actions `createHandler` /
 * `createAction` call it once and pass the result down.
 *
 * Reads cookies: calling it makes the route dynamic. Never call it from a cacheable public page.
 */
export const getSession = cache(async (): Promise<Session> => {
  // Request-time only: the Supabase client reads the clock while restoring the session, which
  // Cache Components refuses during prerendering ("unstable value Date.now()").
  await connection();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? undefined : data?.claims?.sub;
  return { supabase, userId: typeof sub === "string" && sub.length > 0 ? sub : null };
});

/**
 * The current user with status and roles, or null when signed out, when the account row is
 * missing, or when the account has been deleted. One database query, memoised per render.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const { supabase, userId } = await getSession();
  if (!userId) return null;
  const row = await fetchAccessRow(supabase, userId);
  if (!row || row.status === "deleted") return null;
  return row;
});
