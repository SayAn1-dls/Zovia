import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

type RatingStarsProps = {
  /** Average rating 0–5, or null when there are no reviews yet. */
  value: number | null | undefined;
  /** Number of reviews; shown in brackets when provided. */
  count?: number | null;
  /** Show the numeric value next to the stars. */
  showValue?: boolean;
  size?: "sm" | "md";
  className?: string;
};

/**
 * Read-only star rating with partial fill. With no reviews it says
 * "No reviews yet" rather than showing empty stars as if it were a low score.
 */
export function RatingStars({
  value,
  count,
  showValue = true,
  size = "sm",
  className,
}: RatingStarsProps) {
  const hasRating =
    typeof value === "number" && Number.isFinite(value) && (count ?? 1) > 0;
  if (!hasRating) {
    return (
      <span className={cn("text-sm text-muted-foreground", className)}>
        No reviews yet
      </span>
    );
  }
  const rating = Math.min(5, Math.max(0, value));
  const star = size === "md" ? "size-5" : "size-4";
  const label =
    `Rated ${rating.toFixed(1)} out of 5` +
    (typeof count === "number"
      ? ` from ${count} ${count === 1 ? "review" : "reviews"}`
      : "");

  return (
    <span
      role="img"
      aria-label={label}
      className={cn("inline-flex items-center gap-1.5 text-sm", className)}
    >
      <span className="relative inline-flex" aria-hidden>
        <span className="flex text-border">
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn(star, "fill-current")} />
          ))}
        </span>
        <span
          className="absolute inset-y-0 left-0 flex overflow-hidden text-warning"
          style={{ width: `${(rating / 5) * 100}%` }}
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Star key={i} className={cn(star, "shrink-0 fill-current")} />
          ))}
        </span>
      </span>
      {showValue ? (
        <span aria-hidden className="font-semibold">
          {rating.toFixed(1)}
        </span>
      ) : null}
      {typeof count === "number" ? (
        <span aria-hidden className="text-muted-foreground">
          ({count})
        </span>
      ) : null}
    </span>
  );
}
