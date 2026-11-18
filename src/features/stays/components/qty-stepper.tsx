"use client";

import { Minus, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";

/**
 * - / qty / + for beds of one room type. 44 px buttons; arrow keys, Home and End work while a
 * button has focus. Going below 1 removes the type.
 */
export function QtyStepper({
  label,
  value,
  max,
  onChange,
  maxReason,
}: {
  /** e.g. "Double sharing beds" */
  label: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  /** Why + is disabled at the limit, read to screen readers and shown under the stepper. */
  maxReason?: string | null;
}) {
  const atMax = value >= max;
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next =
      event.key === "ArrowUp" || event.key === "ArrowRight"
        ? value + 1
        : event.key === "ArrowDown" || event.key === "ArrowLeft"
          ? value - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? max
              : null;
    if (next === null) return;
    event.preventDefault();
    onChange(Math.max(0, Math.min(next, max)));
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div role="group" aria-label={label} onKeyDown={onKeyDown} className="inline-flex items-center gap-1 rounded-full bg-muted p-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="bg-card hover:bg-card"
          aria-label={value <= 1 ? `Remove ${label.toLowerCase()}` : `One fewer (${label.toLowerCase()})`}
          onClick={() => onChange(value - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" aria-label={`${value} selected`} className="w-8 text-center text-base font-bold tabular-nums">
          {value}
        </output>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          className="bg-card hover:bg-card"
          aria-label={`One more (${label.toLowerCase()})`}
          disabled={atMax}
          onClick={() => onChange(value + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      {atMax && maxReason ? <p className="text-xs text-muted-foreground">{maxReason}</p> : null}
    </div>
  );
}
