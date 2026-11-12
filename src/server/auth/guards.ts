import "server-only";

import type { UserRole } from "@/lib/constants";
import { errors } from "@/server/http/errors";

import { hasRole, isActiveStatus, isAdmin, isStaff } from "./rbac";
import { getCurrentUser, type CurrentUser } from "./session";

/**
 * Guards for every server entry point (pages, layouts, Server Actions, Route Handlers).
 * They throw AppError: `unauthenticated` (401), `forbidden` (403) or `restricted` (403).
 * The proxy's redirects are a convenience; these are the server-side check, and RLS plus the
 * SQL functions remain the final enforcer.
 *
 * Each `assert*` works on a user you already have; each `require*` loads the current user.
 */

const SUSPENDED_MESSAGE = "Your account is suspended. You can review the reason and appeal from your account page.";

export function assertActive(user: CurrentUser): CurrentUser {
  if (!isActiveStatus(user.status)) throw errors.restricted(SUSPENDED_MESSAGE);
  return user;
}

export function assertRole(user: CurrentUser, role: UserRole): CurrentUser {
  assertActive(user);
  if (!hasRole(user, role)) throw errors.forbidden();
  return user;
}

export function assertStaff(user: CurrentUser): CurrentUser {
  assertActive(user);
  if (!isStaff(user)) throw errors.forbidden();
  return user;
}

export function assertAdmin(user: CurrentUser): CurrentUser {
  assertActive(user);
  if (!isAdmin(user)) throw errors.forbidden();
  return user;
}

/** Signed in (any status except deleted). Suspended users pass: use it for the appeal flow only. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw errors.unauthenticated();
  return user;
}

/** Signed in and the account is active or restricted (not suspended). The usual guard. */
export async function requireActive(): Promise<CurrentUser> {
  return assertActive(await requireUser());
}

/** Signed in, active, and holds `role`. */
export async function requireRole(role: UserRole): Promise<CurrentUser> {
  return assertRole(await requireUser(), role);
}

/** Signed in, active, moderator or admin. */
export async function requireStaff(): Promise<CurrentUser> {
  return assertStaff(await requireUser());
}

/** Signed in, active, admin. */
export async function requireAdmin(): Promise<CurrentUser> {
  return assertAdmin(await requireUser());
}
