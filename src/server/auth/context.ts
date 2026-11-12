import "server-only";

import { createSupabasePublicClient } from "@/server/supabase/public";
import type { AppSupabaseClient } from "@/server/supabase/types";

import { assertActive } from "./guards";
import { getCurrentUser, getSession, type CurrentUser } from "./session";
import { errors } from "@/server/http/errors";

/**
 * What every service function receives (spec section 4). `supabase` is the client the
 * repositories must use; `user` is the verified caller (null for anonymous callers).
 */
export type ServiceContext<TUser extends CurrentUser | null = CurrentUser | null> = {
  supabase: AppSupabaseClient;
  user: TUser;
  requestId: string;
};

export type UserServiceContext = ServiceContext<CurrentUser>;
export type PublicServiceContext = ServiceContext<null>;

export function newRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Context for the current request with an optional user (signed-in or anonymous). Reads cookies,
 * so the route becomes dynamic. Use in pages / Server Actions; Route Handlers get the same
 * object from `createHandler`.
 */
export async function getServiceContext(requestId?: string): Promise<ServiceContext> {
  const [{ supabase }, user] = await Promise.all([getSession(), getCurrentUser()]);
  // Generated only after the cookie read: with Cache Components, randomness before any request
  // data is a prerender error ("unstable value crypto.randomUUID()").
  return { supabase, user, requestId: requestId ?? newRequestId() };
}

/** Context that requires a signed-in, non-suspended user (throws 401 / restricted otherwise). */
export async function requireServiceContext(requestId?: string): Promise<UserServiceContext> {
  const context = await getServiceContext(requestId);
  if (!context.user) throw errors.unauthenticated();
  return { ...context, user: assertActive(context.user) };
}

/**
 * Context for cacheable public reads: the cookieless anon client and no user. It touches no
 * request data and generates nothing random, so it is safe inside `"use cache"` functions and
 * prerendered pages. The request id is the fixed string "public".
 */
export function publicServiceContext(): PublicServiceContext {
  return { supabase: createSupabasePublicClient(), user: null, requestId: "public" };
}
