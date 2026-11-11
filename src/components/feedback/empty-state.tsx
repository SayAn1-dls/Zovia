import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Buttons or links, e.g. "Clear filters". */
  action?: ReactNode;
  /** "card" draws a dashed panel; "plain" sits inside an existing surface. */
  variant?: "card" | "plain";
  className?: string;
};

/** Designed "nothing here yet" state. Every list page uses it instead of a blank area. */
export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  variant = "card",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-12 text-center",
        variant === "card" &&
          "rounded-2xl border border-dashed border-input/60 bg-card/60",
        className,
      )}
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-secondary text-violet-strong">
        <Icon className="size-6" aria-hidden />
      </span>
      <h2 className="mt-5 text-xl font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action}
        </div>
      ) : null}
    </div>
  );
}
