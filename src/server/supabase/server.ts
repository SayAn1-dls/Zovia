import "server-only";

import { cookies } from "next/headers";

import { createMemorySupabaseClient, MEMORY_SESSION_COOKIE } from "./memory";
import type { AppSupabaseClient } from "./types";

/**
 * User-scoped in-memory Supabase client for Server Components, Server Actions and Route Handlers.
 */
export async function createSupabaseServerClient(): Promise<AppSupabaseClient> {
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
