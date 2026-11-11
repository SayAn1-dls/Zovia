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
  /** Small uppercase label above the title. */
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** Heading alignment. */
  align?: "left" | "center";
  /** "dark" is a navy band, "tint" is lavender, "plain" is the page background. */
  tone?: "plain" | "tint" | "dark";
  size?: "narrow" | "default" | "wide";
  id?: string;
  className?: string;
  /** Tighter vertical padding for stacked sections. */
  compact?: boolean;
};

/** A vertical page section with consistent rhythm and an optional heading block. */
export function Section({
  children,
  eyebrow,
  title,
  description,
  align = "left",
  tone = "plain",
  size = "default",
  id,
  className,
  compact = false,
}: SectionProps) {
  const headingId = id && title ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        compact ? "py-12 sm:py-16" : "py-16 sm:py-24",
        tone === "tint" && "bg-lavender/60",
        tone === "dark" && "band-dark",
        className,
      )}
    >
      <Container size={size}>
        {title ? (
          <div
            className={cn(
              "mb-10 max-w-2xl sm:mb-14",
              align === "center" && "mx-auto text-center",
            )}
          >
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h2 id={headingId} className="text-display-md font-bold">
              {title}
            </h2>
            {description ? (
              <p className="mt-4 text-lead text-muted-foreground">{description}</p>
            ) : null}
          </div>
        ) : null}
        {children}
      </Container>
    </section>
  );
}

/** Small uppercase label used above headings. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-3 text-[0.8125rem] font-semibold tracking-[0.14em] text-violet-strong uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
