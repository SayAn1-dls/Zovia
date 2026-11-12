import { NextResponse, type NextRequest } from "next/server";

import { fetchAccessRow } from "@/server/auth/access-repository";
import { decideRoute, type RouteUser } from "@/server/auth/route-access";
import { logger, serializeError } from "@/server/logger";
import { createProxySession } from "@/server/supabase/proxy";

/**
 * Next 16 request proxy (the file convention that replaced `middleware`): refreshes the Supabase
 * session cookie and routes private areas. Runs on the Node.js runtime.
 *
 * It runs ONLY for the private prefixes in `config.matcher`, so public pages, static assets,
 * images and `/api/**` never pass through it and stay cacheable (route handlers authenticate
 * themselves through `createHandler`, and can refresh the session cookie on their own).
 *
 * Cost per private navigation: token verification (local, ES256 against cached JWKS) plus ONE
 * database query (own `users` row with embedded `user_roles`) through the user's session. Roles
 * and status are never taken from JWT metadata.
 *
 * This is convenience, not security: every server entry point re-checks with the guards in
 * `@/server/auth`, and RLS enforces the data rules. Routing rules live in
 * `src/server/auth/route-access.ts`. Security headers are set for every response in
 * next.config.ts.
 */

/** A path with no route: rewriting to it renders the app's not-found page with HTTP 404. */
const NOT_FOUND_PATH = "/_zuvio/not-found";

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const session = await createProxySession(request);

  let user: RouteUser | null | "unknown" = null;
  if (session.userId) {
    try {
      const row = await fetchAccessRow(session.supabase, session.userId);
      user = row
        ? { status: row.status, roles: row.roles, onboarded: row.onboarding_completed_at !== null }
        : null;
    } catch (error) {
      logger.error("proxy.account_lookup_failed", { path: pathname, error: serializeError(error) });
      user = "unknown";
    }
  }
  
  const decision = decideRoute({ pathname, search, user });
  switch (decision.kind) {
    case "redirect":
      return session.finish(NextResponse.redirect(new URL(decision.to, request.url)));
    case "not_found":
      return session.finish(NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url)));
    default:
      return session.next();
  }
}

// Must be literal strings (statically analysed). Keep in sync with PRIVATE_PREFIXES in
// src/server/auth/route-access.ts; a unit test compares the two lists.
export const config = {
  matcher: [
    "/saved/:path*",
    "/bookings/:path*",
    "/roommates/:path*",
    "/messages/:path*",
    "/assistant/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/account/:path*",
    "/onboarding/:path*",
    "/owner/:path*",
    "/admin/:path*",
  ],
};
