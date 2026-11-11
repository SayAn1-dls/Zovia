"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";

import { isActivePath } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type NavLinkProps = {
  href: Route;
  exact?: boolean;
  className?: string;
  /** Classes added when the link matches the current path. */
  activeClassName?: string;
  onClick?: () => void;
  children: ReactNode;
};

function ActiveNavLink({ href, exact, className, activeClassName, onClick, children }: NavLinkProps) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href, exact);
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-active={active ? "" : undefined}
      className={cn(className, active && activeClassName)}
    >
      {children}
    </Link>
  );
}

/**
 * Link that marks itself active for the current path (aria-current="page",
 * data-active). `usePathname` can suspend on routes with unknown dynamic
 * params under Cache Components, so the lookup sits in its own Suspense
 * boundary with the inactive link as fallback: the surrounding chrome stays in
 * the static shell.
 */
export function NavLink(props: NavLinkProps) {
  return (
    <Suspense
      fallback={
        <Link href={props.href} className={props.className} onClick={props.onClick}>
          {props.children}
        </Link>
      }
    >
      <ActiveNavLink {...props} />
    </Suspense>
  );
}
