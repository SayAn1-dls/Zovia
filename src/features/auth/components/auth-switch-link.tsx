"use client";

import type { Route } from "next";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { safeNextPath } from "@/lib/api/safe-next-path";
import { withQuery } from "@/lib/navigation";

import { authLinkClass } from "./auth-card";

/** `href` with the current page's `next` carried over, when it is a safe same-origin path. */
export function hrefWithNext(href: Route, next: string | null | undefined): Route {
  const safe = safeNextPath(next, "");
  return safe ? withQuery(href, { next: safe }) : href;
}

function SwitchLink({ href, children }: { href: Route; children: ReactNode }) {
  const next = useSearchParams().get("next");
  return (
    <Link href={hrefWithNext(href, next)} className={authLinkClass}>
      {children}
    </Link>
  );
}

/**
 * The "Create an account" / "Sign in" link under the auth forms. It keeps `?next=`, so someone
 * sent to sign in from Book now who creates an account instead still returns to their booking.
 */
export function AuthSwitchLink({ href, children }: { href: Route; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={authLinkClass}>
          {children}
        </Link>
      }
    >
      <SwitchLink href={href}>{children}</SwitchLink>
    </Suspense>
  );
}
