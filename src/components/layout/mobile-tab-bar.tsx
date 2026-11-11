"use client";

import { mobileTabs } from "@/lib/navigation";

import { NavLink } from "./nav-link";

/**
 * Bottom tab bar for the app area on phones (hidden from `lg` up, where the
 * header carries the navigation). Each tab is a 56 px-tall target. AppShell
 * adds matching bottom padding so content is never hidden behind it.
 */
export function MobileTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {mobileTabs.map((tab) => (
          <li key={tab.href}>
            <NavLink
              href={tab.href}
              className="group flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted-foreground transition-colors duration-150 active:scale-95"
              activeClassName="text-violet-strong"
            >
              <span className="flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-150 group-data-active:bg-secondary">
                <tab.icon className="size-5" aria-hidden />
              </span>
              <span aria-hidden>{"shortLabel" in tab ? tab.shortLabel : tab.label}</span>
              <span className="sr-only">{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
