import "server-only";

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/lib/database.types";
import { authCookieOptions, secureCookies, usesSupabase } from "@/lib/supabase/backend";
import { env } from "@/server/env";

import { createMemorySupabaseClient, MEMORY_SESSION_COOKIE } from "./memory";
import type { AppSupabaseClient } from "./types";

export async function createProxySession(request: NextRequest): Promise<ProxySession> {
  return usesSupabase() ? createRealProxySession(request) : createMemoryProxySession(request);
}

export type ProxySession = {
  /** User-scoped client bound to the request's cookies (RLS applies). */
  supabase: AppSupabaseClient;
  /** Verified user id (JWT `sub`) or null when signed out / the token is invalid. */
  userId: string | null;
  /**
   * Copies refreshed auth cookies and the no-store cache headers onto the response that will
   * actually be returned (pass-through, redirect or rewrite). Always return its result.
   */
  finish(response: NextResponse): NextResponse;
  /** `NextResponse.next()` carrying the (possibly refreshed) request cookies downstream. */
  next(): NextResponse;
};

/**
 * Session handling for `src/proxy.ts`, following @supabase/ssr 0.12:
 *  - cookies are read from the request and written to both the request (so Server Components
 *    rendered in this navigation see the refreshed token) and the response (so the browser
 *    stores it), together with the cache headers the library passes to `setAll`, which keep
 *    CDNs from caching a response that sets auth cookies;
 *  - `auth.getClaims()` is called before anything else. It refreshes an expired session and
 *    verifies the access token's signature: locally against the project's published JWKS for
 *    asymmetric keys (ES256 here, keys cached in memory), or by asking the Auth server for
 *    legacy HS256 projects. `auth.getSession()` alone is never trusted on the server because it
 *    only decodes the cookie.
 */
async function createRealProxySession(request: NextRequest): Promise<ProxySession> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env();
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
  const pendingHeaders: Record<string, string> = {};

  const supabase = createServerClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: authCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            pendingCookies.push({ name, value, options });
          }
          Object.assign(pendingHeaders, headers);
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();
  const sub = error ? undefined : data?.claims?.sub;
  const userId = typeof sub === "string" && sub.length > 0 ? sub : null;

  const finish = (response: NextResponse): NextResponse => {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    for (const [key, value] of Object.entries(pendingHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  };

  return {
    supabase,
    userId,
    finish,
    next: () => finish(NextResponse.next({ request })),
  };
}


async function createMemoryProxySession(request: NextRequest): Promise<ProxySession> {
  const pendingCookies: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createMemorySupabaseClient({
    getSessionToken() {
      return request.cookies.get(MEMORY_SESSION_COOKIE)?.value ?? null;
    },
    setSessionToken(token) {
      if (token) {
        request.cookies.set(MEMORY_SESSION_COOKIE, token);
        pendingCookies.push({
          name: MEMORY_SESSION_COOKIE,
          value: token,
          options: { path: "/", httpOnly: true, sameSite: "lax", secure: secureCookies(), maxAge: 60 * 60 * 24 * 30 },
        });
      } else {
        request.cookies.delete(MEMORY_SESSION_COOKIE);
        pendingCookies.push({
          name: MEMORY_SESSION_COOKIE,
          value: "",
          options: { path: "/", httpOnly: true, sameSite: "lax", secure: secureCookies(), maxAge: 0 },
        });
      }
    },
  });

  let userId: string | null = null;
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = error ? undefined : data?.claims?.sub;
    userId = typeof sub === "string" && sub.length > 0 ? sub : null;
  } catch {
    userId = null;
  }

  const finish = (response: NextResponse): NextResponse => {
    for (const { name, value, options } of pendingCookies) {
      response.cookies.set(name, value, options);
    }
    return response;
  };

  return {
    supabase,
    userId,
    finish,
    next: () => finish(NextResponse.next({ request })),
  };
}
