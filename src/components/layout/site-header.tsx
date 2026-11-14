"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Logo } from "@/components/brand/logo";
import { useSession } from "@/components/session/session-context";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { accountNav, appNav, marketingNav, type NavItem, routes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { NavLink } from "./nav-link";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

type SiteHeaderProps = {
  /**
   * "marketing": public pages (marketing links, sign-in actions). "app": the
   * signed-in product (pair it with <MobileTabBar>, which carries the nav on
   * phones). Both are the same flat paper bar with a 1px rule.
   */
  variant?: "marketing" | "app";
  className?: string;
};

/**
 * Sticky site header. The signed-in state comes from `useSession()` on the
 * client, so the header never forces a page to render dynamically.
 */
export function SiteHeader({ variant = "marketing", className }: SiteHeaderProps) {
  const session = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const isApp = variant === "app";
  const links: readonly NavItem[] = isApp ? appNav : marketingNav;
  const closeMenu = () => setMenuOpen(false);

  const authActions =
    session.status === "loading" ? (
      <span aria-hidden className="h-11 w-28 rounded-full bg-muted" />
    ) : session.status === "signed_in" ? (
      <>
        {isApp ? (
          <NotificationBell userId={session.user.id} />
        ) : (
          <Link
            href={routes.search}
            className={cn(buttonVariants({ size: "lg" }), "hidden sm:inline-flex")}
          >
            Open Zovia
          </Link>
        )}
        <UserMenu />
      </>
    ) : (
      <>
        <Link
          href={routes.signIn}
          className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "hidden sm:inline-flex")}
        >
          Sign in
        </Link>
        <Link href={routes.signUp} className={buttonVariants({ size: "lg" })}>
          Get started
        </Link>
      </>
    );

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-(--header-height) border-b border-border bg-background",
        className,
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-7xl items-center gap-2 px-4 sm:px-8">
        <Link
          href={isApp ? routes.search : routes.home}
          aria-label="Zovia home"
          className="mr-2 flex h-11 items-center rounded-lg text-foreground"
        >
          <Logo size="sm" className="sm:hidden" />
          <Logo size="md" className="hidden sm:inline-flex" />
        </Link>

        <nav aria-label="Main" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((item) => (
              <li key={item.href}>
                <NavLink
                  href={item.href}
                  className="inline-flex h-11 items-center rounded-full px-3.5 text-sm font-medium text-foreground/70 transition-colors duration-150 hover:text-foreground"
                  activeClassName="text-foreground underline decoration-2 underline-offset-8"
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {authActions}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className={cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "lg:hidden")}
            >
              <Menu aria-hidden />
            </SheetTrigger>
            <SheetContent side="right" className="w-[min(22rem,88vw)] gap-0">
              <SheetHeader>
                <SheetTitle>
                  <Logo size="sm" />
                </SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 pb-4">
                <ul className="space-y-1">
                  {links.map((item) => (
                    <li key={item.href}>
                      <NavLink
                        href={item.href}
                        onClick={closeMenu}
                        className="flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-muted"
                        activeClassName="bg-ink text-white hover:bg-ink"
                      >
                        <item.icon className="size-5 text-muted-foreground" aria-hidden />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
                {session.status === "signed_in" ? (
                  <ul className="mt-3 space-y-1 border-t pt-3">
                    {accountNav.map((item) => (
                      <li key={item.href}>
                        <NavLink
                          href={item.href}
                          onClick={closeMenu}
                          className="flex h-12 items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-muted"
                          activeClassName="bg-ink text-white hover:bg-ink"
                        >
                          <item.icon className="size-5 text-muted-foreground" aria-hidden />
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </nav>
              {session.status === "signed_out" ? (
                <div className="grid gap-2 border-t p-4">
                  <Link
                    href={routes.signUp}
                    onClick={closeMenu}
                    className={buttonVariants({ size: "lg" })}
                  >
                    Get started
                  </Link>
                  <Link
                    href={routes.signIn}
                    onClick={closeMenu}
                    className={buttonVariants({ variant: "outline", size: "lg" })}
                  >
                    Sign in
                  </Link>
                </div>
              ) : null}
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
