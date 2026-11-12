"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import type { ActionResult } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Card that groups one editor section. */
export function Panel({ title, description, children, className }: { title?: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-card p-4 ring-1 ring-border sm:p-6", className)}>
      {title ? <h2 className="text-lg font-bold text-foreground">{title}</h2> : null}
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className={cn(title || description ? "mt-5" : undefined)}>{children}</div>
    </section>
  );
}

/** A checkbox row with a 44 px touch target (native input: reliable with every keyboard and tester). */
export function CheckRow({
  label,
  checked,
  onChange,
  description,
  name,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  name?: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-1 text-[0.9375rem]">
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-5 shrink-0 cursor-pointer accent-[var(--ink)]"
      />
      <span className="min-w-0">
        <span className="font-medium text-foreground">{label}</span>
        {description ? <span className="block text-sm text-muted-foreground">{description}</span> : null}
      </span>
    </label>
  );
}

/** Pill toggle (amenities): a real button with aria-pressed. */
export function TogglePill({ label, pressed, onToggle }: { label: string; pressed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
        pressed ? "border-ink bg-ink text-white" : "border-foreground/20 bg-card text-foreground hover:border-foreground",
      )}
    >
      {pressed ? <Check className="size-4" aria-hidden /> : null}
      {label}
    </button>
  );
}

/**
 * Runs a Server Action result: toast on success, toast + return false on failure.
 * Returns the data (or null on failure) so callers can continue.
 */
export function handleResult<T>(result: ActionResult<T>, success?: string): T | null {
  if (!result.ok) {
    toast.error(result.error.message);
    return null;
  }
  if (success) toast.success(success);
  return result.data;
}
