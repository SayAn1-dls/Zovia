"use client";

import { Moon } from "lucide-react";
import { useId } from "react";

import { Input } from "@/components/ui/input";

import { STAY_RULES } from "../schemas";
import { addDays, indiaToday } from "../hooks/stay-dates";
import type { StayDates } from "../hooks/stay-url-state";
import { formatClock, nightsLabel } from "../hooks/stay-text";

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
    <fieldset className="space-y-2">
      <legend className="sr-only">Dates</legend>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-in`} className="text-sm font-semibold">
            Check-in
          </label>
          <Input
            id={`${id}-in`}
            type="date"
            className="h-11"
            min={today}
            max={lastCheckin}
            value={dates.checkin}
            required
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              onChange({ checkin: value, checkout: addDays(value, Math.max(1, dates.nights)) });
            }}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-out`} className="text-sm font-semibold">
            Check-out
          </label>
          <Input
            id={`${id}-out`}
            type="date"
            className="h-11"
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
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
        <Moon className="size-3.5" aria-hidden />
        {nightsLabel(dates.nights)} · check-in {formatClock(STAY_RULES.check_in_time)}, check-out {formatClock(STAY_RULES.check_out_time)}
      </p>
    </fieldset>
  );
}
