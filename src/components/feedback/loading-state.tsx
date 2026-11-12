import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  /** Which skeleton preset to draw. */
  variant?: "card-grid" | "list" | "detail" | "form" | "page";
  /** Number of cards / rows for the grid and list presets. */
  count?: number;
  /** Accessible status text. */
  label?: string;
  className?: string;
};

function CardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl bg-card ring-1 ring-border">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-5">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** Grid of listing-shaped cards. */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Rows with an avatar and two lines (conversations, enquiries, notifications). */
export function ListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
          <Skeleton className="hidden h-8 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );
}

/** Media + title + facts + sidebar (property detail, profile detail). */
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="aspect-[16/9] w-full rounded-3xl sm:aspect-[21/9]" />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <div className="flex flex-wrap gap-2 py-2">
            <Skeleton className="h-7 w-28 rounded-full" />
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="h-7 w-32 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Labelled fields and a submit button. */
export function FormSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      ))}
      <Skeleton className="h-11 w-36 rounded-full" />
    </div>
  );
}

/** Heading + card grid; the default for route-level loading.tsx files. */
export function PageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-10 w-64 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>
      <CardGridSkeleton count={3} />
    </div>
  );
}

/**
 * Loading state with skeleton presets. Wraps the preset in a polite live
 * region so screen readers hear "Loading" once.
 */
export function LoadingState({
  variant = "card-grid",
  count,
  label = "Loading",
  className,
}: LoadingStateProps) {
  return (
    <div role="status" aria-busy="true" className={cn("w-full", className)}>
      <span className="sr-only">{label}</span>
      <div aria-hidden>
        {variant === "card-grid" ? <CardGridSkeleton count={count} /> : null}
        {variant === "list" ? <ListSkeleton count={count} /> : null}
        {variant === "detail" ? <DetailSkeleton /> : null}
        {variant === "form" ? <FormSkeleton count={count} /> : null}
        {variant === "page" ? <PageSkeleton /> : null}
      </div>
    </div>
  );
}
