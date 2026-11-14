import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Accessible name. Omit when the mark sits next to visible text. */
  title?: string;
};

/** The whole mark is this one path (32 x 32 box): an arch and a dot. */
export const LOGO_MARK_PATH =
  "M3 29V15a13 13 0 0 1 26 0v14h-5.5V15a7.5 7.5 0 0 0-15 0v14zM16 13.5a4 4 0 1 1 0 8a4 4 0 0 1 0-8z";

/**
 * The Zovia mark: a doorway with someone in it (a space, and a person).
 * A single path in one flat colour (`currentColor`), with no container: ink
 * on paper, white on ink, crisp at 16 px.
 */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="currentColor"
    >
      <path d={LOGO_MARK_PATH} />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** "full" shows mark + wordmark; "mark" shows the mark only. */
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { mark: "size-5", word: "text-[1.0625rem]", gap: "gap-1.5" },
  md: { mark: "size-6", word: "text-[1.25rem]", gap: "gap-2" },
  lg: { mark: "size-10", word: "text-[2.125rem]", gap: "gap-3" },
} as const;

/**
 * Zovia logo: mark + tight lowercase wordmark set in Unbounded. Inherits text colour, so it
 * works on paper and reversed on ink. Wrap it in a link yourself (SiteHeader
 * and SiteFooter already do).
 */
export function Logo({ className, variant = "full", size = "md" }: LogoProps) {
  const s = sizes[size];
  if (variant === "mark") {
    return <LogoMark className={cn(s.mark, className)} title="Zovia" />;
  }
  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <LogoMark className={s.mark} />
      <span
        className={cn("font-heading leading-none font-bold tracking-[-0.04em]", s.word)}
      >
        zovia
      </span>
    </span>
  );
}
