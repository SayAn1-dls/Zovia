import "server-only";

import { redirect } from "next/navigation";

import { routes, withQuery } from "@/lib/navigation";
import { getServiceContext, hasRole, isActiveStatus, type UserServiceContext } from "@/server/auth";

/**
 * Server-side guard for owner pages (the proxy redirect is only a convenience). Call it inside
 * the page's Suspense boundary: it reads the session cookie.
 *
 *  - signed out          -> /sign-in?next=<path>
 *  - suspended           -> /account/suspended
 *  - not an owner (yet)  -> /owner/onboarding   (unless `allowNonOwner`)
 */
export async function ownerPageContext(path: string, options: { allowNonOwner?: boolean } = {}): Promise<UserServiceContext> {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(withQuery(routes.signIn, { next: path }));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  if (!options.allowNonOwner && !hasRole(user, "owner")) redirect(routes.ownerOnboarding);
  return { supabase, user, requestId };
}
