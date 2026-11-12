import { ChevronLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Container, Eyebrow } from "./section";

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons aligned to the right on desktop, below the title on mobile. */
  actions?: ReactNode;
  /** Back link shown above the title. */
  back?: { href: Route; label: string };
  eyebrow?: string;
  className?: string;
};

/** Title block for app, owner and admin pages. Renders the page's single <h1>. */
export function PageHeader({ title, description, actions, back, eyebrow, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 sm:mb-8", className)}>
      {back ? (
        <Link
          href={back.href}
          className="-ml-2 mb-2 inline-flex h-11 items-center gap-1 rounded-full px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
          {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="text-display-sm font-extrabold sm:text-display-md">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-2xl text-base text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

type MarketingHeroProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  size?: "narrow" | "default";
};

/** Page opener for marketing and legal pages: big left-aligned type on paper, ruled off below. */
export function MarketingHero({ eyebrow, title, description, children, size = "default" }: MarketingHeroProps) {
  return (
    <div className="border-b border-foreground">
      <Container size={size} className="pt-12 pb-10 sm:pt-20 sm:pb-14">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="max-w-4xl text-display-lg font-extrabold">{title}</h1>
        {description ? (
          <p className="mt-5 max-w-xl text-lead text-muted-foreground">{description}</p>
        ) : null}
        {children ? <div className="mt-8">{children}</div> : null}
      </Container>
    </div>
  );
}
