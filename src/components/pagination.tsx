import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Page numbers to show: first, last, current ±1, with "gap" markers between. Pure; unit-tested. */
export function paginationRange(page: number, totalPages: number): (number | "gap")[] {
  const total = Math.max(1, Math.floor(totalPages));
  const current = Math.min(total, Math.max(1, Math.floor(page)));
  const wanted = new Set<number>([1, total, current - 1, current, current + 1]);
  if (current <= 3) [2, 3, 4].forEach((n) => wanted.add(n));
  if (current >= total - 2) [total - 1, total - 2, total - 3].forEach((n) => wanted.add(n));
  const pages = [...wanted].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let previous = 0;
  for (const n of pages) {
    if (n - previous === 2) out.push(previous + 1);
    else if (n - previous > 2) out.push("gap");
    out.push(n);
    previous = n;
  }
  return out;
}

type PaginationProps = {
  /** Current page, 1-based (API `meta.page`). */
  page: number;
  /** Total pages: Math.ceil(meta.total / meta.limit). */
  totalPages: number;
  /** Builds the link for a page, e.g. (p) => withQuery(routes.search, { ...filters, page: p }). */
  hrefForPage: (page: number) => Route;
  className?: string;
};

/**
 * Link-based pagination (works without JavaScript, crawlable, keeps filters in
 * the URL). Renders nothing for a single page. 44 px targets.
 */
export function Pagination({ page, totalPages, hrefForPage, className }: PaginationProps) {
  const total = Math.max(1, Math.floor(totalPages));
  if (total <= 1) return null;
  const current = Math.min(total, Math.max(1, Math.floor(page)));
  const item = cn(buttonVariants({ variant: "ghost", size: "icon-lg" }), "tabular-nums");

  return (
    <nav aria-label="Pagination" className={cn("flex items-center justify-center gap-1", className)}>
      {current > 1 ? (
        <Link href={hrefForPage(current - 1)} rel="prev" aria-label="Previous page" className={item}>
          <ChevronLeft aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(item, "pointer-events-none opacity-40")}>
          <ChevronLeft />
        </span>
      )}
      <ul className="flex items-center gap-1">
        {paginationRange(current, total).map((entry, index) =>
          entry === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </li>
          ) : (
            <li key={entry} className={cn(Math.abs(entry - current) > 1 && entry !== 1 && entry !== total && "hidden sm:block")}>
              <Link
                href={hrefForPage(entry)}
                aria-label={`Page ${entry}`}
                aria-current={entry === current ? "page" : undefined}
                className={cn(
                  item,
                  entry === current && "bg-ink text-white hover:bg-ink hover:text-white",
                )}
              >
                {entry}
              </Link>
            </li>
          ),
        )}
      </ul>
      {current < total ? (
        <Link href={hrefForPage(current + 1)} rel="next" aria-label="Next page" className={item}>
          <ChevronRight aria-hidden />
        </Link>
      ) : (
        <span aria-hidden className={cn(item, "pointer-events-none opacity-40")}>
          <ChevronRight />
        </span>
      )}
    </nav>
  );
}
