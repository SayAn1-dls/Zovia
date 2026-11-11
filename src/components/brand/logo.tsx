import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
  /** Accessible name. Omit when the mark sits next to visible text. */
  title?: string;
};

/**
 * The ZUVIO mark: a rounded tile holding a "Z" whose two bars are a pair of
 * people-shaped pills (space + people). Pure SVG, safe in server components.
 */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("size-9 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <defs>
        <linearGradient
          id="zuvio-mark"
          x1="0"
          y1="0"
          x2="40"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#6D4AFF" />
          <stop offset="1" stopColor="#4F7CFF" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="12" fill="url(#zuvio-mark)" />
      <path
        d="M12.5 13h15L12.5 27h15"
        fill="none"
        stroke="#fff"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="29.5" cy="10.5" r="2.6" fill="#19C37D" />
    </svg>
  );
}

type LogoProps = {
  className?: string;
  /** "full" shows mark + wordmark; "mark" shows the tile only. */
  variant?: "full" | "mark";
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: { mark: "size-7", word: "text-lg" },
  md: { mark: "size-9", word: "text-[1.375rem]" },
  lg: { mark: "size-12", word: "text-3xl" },
} as const;

/**
 * ZUVIO logo. Inherits text colour, so it works on paper and on navy bands.
 * Wrap it in a link yourself (SiteHeader and SiteFooter already do).
 */
export function Logo({ className, variant = "full", size = "md" }: LogoProps) {
  const s = sizes[size];
  if (variant === "mark") {
    return <LogoMark className={cn(s.mark, className)} title="ZUVIO" />;
  }
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={s.mark} />
      <span
        className={cn(
          "font-heading leading-none font-extrabold tracking-[-0.04em]",
          s.word,
        )}
      >
        ZUVIO
      </span>
    </span>
  );
}
