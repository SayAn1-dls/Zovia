"use client";

import { Moon } from "lucide-react";
import { useId } from "react";

import { STAY_RULES } from "../schemas";
import { addDays, indiaToday } from "../hooks/stay-dates";
import type { StayDates } from "../hooks/stay-url-state";
import { formatClock, nightsLabel } from "../hooks/stay-text";

/** A borderless native date input inside the shared box: 44 px tall, the phone's own picker on touch. */
const DATE_INPUT =
  "h-11 w-full min-w-0 bg-transparent text-base font-medium tabular-nums outline-none sm:text-[0.9375rem]";

/**
 * Check-in and check-out as two native date inputs (the phone's own picker on touch). Moving
 * check-in keeps the number of nights; check-out is always after check-in and at most 30 nights on.
 */
export function DateRangeFields({
  dates,
  onChange,
  today = indiaToday(),
}: {
  dates: StayDates;
  onChange: (next: { checkin: string; checkout: string }) => void;
  today?: string;
}) {
  const id = useId();
  const lastCheckin = addDays(today, STAY_RULES.max_days_ahead);

  return (
    <div className="@container">
      <fieldset className="space-y-3">
        <legend className="sr-only">Dates</legend>
        {/* One hairline box, two halves; stacked when the column is narrower than 20rem (small phones, the 1024 px sidebar) so a date is never clipped. */}
        <div className="grid grid-cols-1 divide-y divide-border overflow-hidden rounded-2xl ring-1 ring-input @[20rem]:grid-cols-2 @[20rem]:divide-x @[20rem]:divide-y-0">
          <div className="flex min-w-0 flex-col px-4 pt-2.5 pb-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
            <label
              htmlFor={`${id}-in`}
              className="text-xs font-semibold text-muted-foreground"
            >
              Check-in
            </label>
            <input
              id={`${id}-in`}
              type="date"
              className={DATE_INPUT}
              min={today}
              max={lastCheckin}
              value={dates.checkin}
              required
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                onChange({
                  checkin: value,
                  checkout: addDays(value, Math.max(1, dates.nights)),
                });
              }}
            />
          </div>
          <div className="flex min-w-0 flex-col px-4 pt-2.5 pb-1 focus-within:ring-2 focus-within:ring-ring focus-within:ring-inset">
            <label
              htmlFor={`${id}-out`}
              className="text-xs font-semibold text-muted-foreground"
            >
              Check-out
            </label>
            <input
              id={`${id}-out`}
              type="date"
              className={DATE_INPUT}
              min={addDays(dates.checkin, STAY_RULES.min_nights)}
              max={addDays(dates.checkin, STAY_RULES.max_nights)}
              value={dates.checkout}
              required
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                onChange({ checkin: dates.checkin, checkout: value });
              }}
            />
          </div>
        </div>
        <p
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
          aria-live="polite"
        >
          <Moon className="size-3.5 shrink-0" aria-hidden />
          <span>
            <span className="font-medium text-foreground">
              {nightsLabel(dates.nights)}
            </span>{" "}
            · check-in {formatClock(STAY_RULES.check_in_time)}, out{" "}
            {formatClock(STAY_RULES.check_out_time)}
          </span>
        </p>
      </fieldset>
    </div>
  );
}
