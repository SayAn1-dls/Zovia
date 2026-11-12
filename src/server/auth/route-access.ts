import { safeNextPath } from "@/lib/api/safe-next-path";

import { hasRole, isStaff, type AccessProfile } from "./rbac";

/**
 * Pure routing rules for `src/proxy.ts` (unit-tested). Convenience only: every page, action and
 * route handler re-checks with the guards, and RLS enforces the data rules.
 *
 * KEEP IN SYNC with `config.matcher` in src/proxy.ts: the proxy only runs for these prefixes, so
 * public pages (/, marketing, /search, /properties/**, auth pages, /docs) never touch cookies
 * here and stay cacheable.
 */
export const PRIVATE_PREFIXES = [
  "/saved",
  "/bookings",
  "/roommates",
  "/messages",
  "/assistant",
  "/notifications",
  "/settings",
  "/account",
  "/onboarding",
  "/owner",
  "/admin",
] as const;

export const ROUTES = {
  signIn: "/sign-in",
  onboarding: "/onboarding",
  suspended: "/account/suspended",
  ownerOnboarding: "/owner/onboarding",
  listYourProperty: "/list-your-property",
} as const;

export type RouteUser = AccessProfile & { onboarded: boolean };

export type RouteDecision =
  | { kind: "next" }
  | { kind: "redirect"; to: string }
  /** Answer as if the path did not exist (used to hide /admin from non-staff). */
  | { kind: "not_found" };

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPrivatePath(pathname: string): boolean {
  return PRIVATE_PREFIXES.some((prefix) => under(pathname, prefix));
}

function withNext(target: string, pathname: string, search: string): string {
  const next = safeNextPath(`${pathname}${search}`, "");
  return next ? `${target}?next=${encodeURIComponent(next)}` : target;
}

/**
 * @param user the signed-in account; `null` when signed out (or the account is deleted / has no
 *   row); `"unknown"` when the session is valid but the account lookup failed.
 */
export function decideRoute(input: {
  pathname: string;
  search?: string;
  user: RouteUser | null | "unknown";
}): RouteDecision {
  const { pathname, user } = input;
  const search = input.search ?? "";
  if (!isPrivatePath(pathname)) return { kind: "next" };

  if (user === null) return { kind: "redirect", to: withNext(ROUTES.signIn, pathname, search) };

  if (user === "unknown") {
    // Could not read the account: never open /admin on a guess; elsewhere the page's own
    // guards decide (and will surface the outage).
    return under(pathname, "/admin") ? { kind: "not_found" } : { kind: "next" };
  }

  if (user.status === "deleted") {
    return { kind: "redirect", to: withNext(ROUTES.signIn, pathname, search) };
  }

  if (user.status === "suspended") {
    return under(pathname, ROUTES.suspended) ? { kind: "next" } : { kind: "redirect", to: ROUTES.suspended };
  }
  if (under(pathname, ROUTES.suspended)) return { kind: "next" };

  if (under(pathname, "/admin")) {
    // Staff may be bootstrapped by script without going through onboarding.
    return isStaff(user) ? { kind: "next" } : { kind: "not_found" };
  }

  // Onboarding is optional (product-owner decision 2026-11-13): signing up lands straight in the
  // app; the questions can be answered later from /onboarding or settings.

  if (under(pathname, "/owner")) {
    // /owner/onboarding is where a signed-in user becomes an owner, so it cannot require the role.
    if (under(pathname, ROUTES.ownerOnboarding) || hasRole(user, "owner")) return { kind: "next" };
    return { kind: "redirect", to: ROUTES.listYourProperty };
  }

  return { kind: "next" };
}
