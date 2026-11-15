import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "@/lib/database.types";
import { usesSupabase } from "@/lib/supabase/backend";
import { env } from "@/server/env";

import { createMemorySupabaseClient, MEMORY_SESSION_COOKIE } from "./memory";
import type { AppSupabaseClient } from "./types";

/** The request's user-scoped client: real Supabase when configured, else the local demo store. */
export async function createSupabaseServerClient(): Promise<AppSupabaseClient> {
  return usesSupabase() ? createRealServerClient() : createMemoryServerClient();
}

/**
 * User-scoped Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * - Carries the caller's cookie session, so every query runs as that user under RLS (or as
 *   `anon` when signed out). It uses the public (publishable/anon) key only.
 * - Create one per request and pass it down (ServiceContext); never keep it in module scope:
 *   @supabase/ssr delivers the no-store cache headers with a client's first cookie write only.
 * - Reads cookies, so it makes the calling route dynamic. Cacheable public pages must use
 *   `createSupabasePublicClient()` from "./public" instead.
 *
 * Cookie contract follows @supabase/ssr 0.12 (`getAll` / `setAll(cookies, headers)`). In a
 * Server Component cookies cannot be written; that is fine because `src/proxy.ts` refreshes
 * the session before private pages render, and Route Handlers / Server Actions can write.
 */
async function createRealServerClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();

  return createServerClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called while rendering a Server Component, where cookies are read-only.
          // The proxy has already refreshed the session for this navigation.
        }
      },
    },
  });
}

/**
 * User-scoped in-memory Supabase client for Server Components, Server Actions and Route Handlers.
 */
async function createMemoryServerClient(): Promise<AppSupabaseClient> {
  const cookieStore = await cookies();

  return createMemorySupabaseClient({
    getSessionToken() {
      return cookieStore.get(MEMORY_SESSION_COOKIE)?.value ?? null;
    },
    setSessionToken(token) {
      try {
        if (token) {
          cookieStore.set(MEMORY_SESSION_COOKIE, token, {
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 30,
          });
        } else {
          cookieStore.delete(MEMORY_SESSION_COOKIE);
        }
      } catch {
        // Called while rendering a Server Component, where cookies are read-only.
      }
    },
  });
}
