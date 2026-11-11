import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MobileTabBar } from "./mobile-tab-bar";
import { Container } from "./section";
import { SiteHeader } from "./site-header";

type AppShellProps = {
  children: ReactNode;
  /** Content width. "full" removes the container (maps, chat, swipe deck). */
  width?: "narrow" | "default" | "wide" | "full";
  /** Hide the bottom tab bar (e.g. inside a full-screen conversation). */
  hideTabBar?: boolean;
  className?: string;
};

/**
 * Frame for the signed-in product: app header, main landmark and, on phones,
 * the bottom tab bar. Used by src/app/(app)/layout.tsx. It reads no request
 * data itself.
 */
export function AppShell({ children, width = "default", hideTabBar = false, className }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader variant="app" />
      <main
        id="main-content"
        tabIndex={-1}
        className={cn(
          "flex-1 outline-none",
          !hideTabBar && "pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0",
          className,
        )}
      >
        {width === "full" ? (
          children
        ) : (
          <Container size={width} className="py-6 sm:py-10">
            {children}
          </Container>
        )}
      </main>
      {hideTabBar ? null : <MobileTabBar />}
    </div>
  );
}
