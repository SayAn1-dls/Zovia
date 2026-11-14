"use client";

import { ArrowLeft, Menu } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { adminNav, type NavGroup, ownerNav, routes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { NavLink } from "./nav-link";
import { UserMenu } from "./user-menu";

const areas = {
  owner: { label: "Owner portal", nav: ownerNav as readonly NavGroup[], home: routes.owner },
  admin: { label: "Admin", nav: adminNav as readonly NavGroup[], home: routes.admin },
} as const;

type DashboardShellProps = {
  /** Which sidebar to show. The nav itself comes from src/lib/navigation.ts. */
  area: keyof typeof areas;
  children: ReactNode;
};

function SidebarNav({ groups, onNavigate }: { groups: readonly NavGroup[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Section" className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <h2 className="px-3 font-sans text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">
            {group.label}
          </h2>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  exact={item.exact}
                  onClick={onNavigate}
                  className="flex h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-medium text-foreground/80 transition-colors duration-150 hover:bg-muted hover:text-foreground"
                  activeClassName="bg-ink font-semibold text-white hover:bg-ink hover:text-white"
                >
                  <item.icon className="size-[1.125rem] shrink-0" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Sidebar layout shared by the owner portal and the admin dashboard: fixed
 * sidebar from `lg` up, a slide-over menu below that. Used by
 * src/app/owner/layout.tsx and src/app/admin/layout.tsx.
 */
export function DashboardShell({ area, children }: DashboardShellProps) {
  const [open, setOpen] = useState(false);
  const config = areas[area];

  const backLink = (
    <Link
      href={routes.search}
      onClick={() => setOpen(false)}
      className="flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden />
      Back to Zovia
    </Link>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-(--header-height) items-center gap-3 px-6">
          <Link href={config.home} aria-label={`${config.label} home`} className="rounded-lg">
            <Logo size="sm" />
          </Link>
          <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-semibold text-ink">
            {config.label}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarNav groups={config.nav} />
        </div>
        <div className="border-t border-border p-3">{backLink}</div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-(--header-height) items-center gap-2 border-b border-border bg-background px-4 sm:px-8">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "-ml-2 lg:hidden")}
            >
              <Menu aria-hidden />
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(20rem,88vw)] gap-0">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-3">
                  <Logo size="sm" />
                </SheetTitle>
                <SheetDescription>{config.label}</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-3 pb-4">
                <SidebarNav groups={config.nav} onNavigate={() => setOpen(false)} />
              </div>
              <div className="border-t border-border p-3">{backLink}</div>
            </SheetContent>
          </Sheet>
          <span className="font-heading text-lg font-bold tracking-tight lg:hidden">{config.label}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <UserMenu />
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 outline-none sm:px-8 sm:py-10">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
