import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Centred page-width wrapper with the standard gutters (20 px mobile, 32 px desktop). */
export function Container({
  children,
  className,
  size = "default",
}: {
  children: ReactNode;
  className?: string;
  /** "narrow" for reading widths (legal, forms), "wide" for dashboards. */
  size?: "narrow" | "default" | "wide";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-5 sm:px-8",
        size === "narrow" && "max-w-3xl",
        size === "default" && "max-w-6xl",
        size === "wide" && "max-w-7xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

type SectionProps = {
  children: ReactNode;
  /** Small label above the title. */
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** "dark" is a solid ink section, "plain" is the page background. */
  tone?: "plain" | "dark";
  size?: "narrow" | "default" | "wide";
  id?: string;
  className?: string;
  /** Draws a 1px rule above the section (editorial divider). */
  divider?: boolean;
};

/** A vertical page section with consistent rhythm and an optional left-aligned heading. */
export function Section({
  children,
  eyebrow,
  title,
  description,
  tone = "plain",
  size = "default",
  id,
  className,
  divider = false,
}: SectionProps) {
  const headingId = id && title ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("py-14 sm:py-20", tone === "dark" && "band-dark", className)}
    >
      <Container size={size}>
        {divider ? <div aria-hidden className="mb-10 h-px bg-foreground sm:mb-14" /> : null}
        {title ? (
          <div className="mb-8 max-w-2xl sm:mb-12">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h2 id={headingId} className="text-display-md font-extrabold">
              {title}
            </h2>
            {description ? (
              <p className="mt-3 text-lead text-muted-foreground">{description}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

/** Small label used above headings. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("mb-3 text-sm font-semibold text-muted-foreground", className)}>
      {children}
    </p>
  );
}
