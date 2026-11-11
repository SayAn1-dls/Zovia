"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  description?: ReactNode;
  /** Shown as "Reference: abc123" so support can match server logs (error.digest / request_id). */
  reference?: string | null;
  /** Renders a "Try again" button. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Extra actions next to retry, e.g. a link home. */
  action?: ReactNode;
  variant?: "card" | "plain";
  className?: string;
};

/** Designed failure state with an optional retry. Announced to assistive tech. */
export function ErrorState({
  title = "Something went wrong",
  description = "That did not load. Check your connection and try again.",
  reference,
  onRetry,
  retryLabel = "Try again",
  action,
  variant = "card",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center",
        variant === "card" &&
          "rounded-2xl border border-destructive/20 bg-danger-surface/50",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-danger-surface text-danger-foreground">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {reference ? (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Reference: {reference}
        </p>
      ) : null}
      {onRetry || action ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button size="lg" onClick={onRetry}>
              <RotateCw data-icon="inline-start" aria-hidden />
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
