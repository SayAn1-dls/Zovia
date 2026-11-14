import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { createMemorySupabaseClient, MEMORY_SESSION_COOKIE } from "./memory";
import type { AppSupabaseClient } from "./types";

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

export async function createProxySession(request: NextRequest): Promise<ProxySession> {
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
          options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 30 },
        });
      } else {
        request.cookies.delete(MEMORY_SESSION_COOKIE);
        pendingCookies.push({
          name: MEMORY_SESSION_COOKIE,
          value: "",
          options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 },
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
