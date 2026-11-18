"use client";

import type { Route } from "next";
import Link from "next/link";

import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { STAY_RULES, type StayAlternative, type StayNight, type StayRoomAvailability } from "../schemas";
import { bedsLabel, formatDayMonth, formatWeekday } from "../hooks/stay-text";
import { QtyStepper } from "./qty-stepper";

/**
 * One room type as a row of the booking list: name, AC and bathroom in plain words, the nightly
 * price (from the monthly rent), beds left, and "Select bed" that turns into a stepper. Sold out
 * for the dates: the 7-night strip instead.
 */
export function RoomTypeCard({
  room,
  qty,
  max,
  onQtyChange,
  onPickNight,
  alternatives,
  alternativeHref,
}: {
  room: StayRoomAvailability;
  qty: number;
  /** Most beds of this type allowed now (units left and the 8-bed cap). */
  max: number;
  onQtyChange: (next: number) => void;
  /** Sold-out strip: start the stay on another night. */
  onPickNight: (date: string) => void;
  /** Nearby places with beds, shown when this type is sold out. */
  alternatives?: StayAlternative[];
  alternativeHref?: (slug: string) => Route;
}) {
  const headingId = `room-${room.room_type}`;
  const short = qty > room.units_left;
  const selected = qty > 0 && !room.sold_out;
  const maxReason =
    max >= room.units_left ? `Only ${bedsLabel(room.units_left)} left.` : `At most ${STAY_RULES.max_units} beds in one booking.`;

  return (
    <li aria-labelledby={headingId} data-selected={selected || undefined} className="py-6 first:pt-1 last:pb-1">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id={headingId} className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
            {selected ? <span aria-hidden className="size-2 shrink-0 rounded-full bg-lime ring-1 ring-ink/20" /> : null}
            {room.label}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {room.ac ? "AC" : "Non-AC"} · {room.attached_bathroom ? "Attached bath" : "Shared bath"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-2xl leading-none font-semibold tracking-tight">
            <Money amount={room.unit_price_inr} />
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">per bed / night</p>
        </div>
      </div>

      {room.sold_out ? (
        <>
          <SoldOutStrip room={room} onPickNight={onPickNight} />
          {alternatives && alternativeHref ? <NearbyAlternatives items={alternatives} hrefFor={alternativeHref} /> : null}
        </>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 text-xs text-muted-foreground">
            <span className={cn("block text-sm font-medium", room.units_left <= 2 ? "text-warning-foreground" : "text-success-foreground")}>
              {room.units_left === 1 ? "1 bed left" : `${room.units_left} beds left`}
            </span>
            <Money amount={room.rent_per_month_inr} /> a month ÷ {STAY_RULES.days_per_month}
          </p>
          {qty > 0 ? (
            <QtyStepper label={`${room.label} beds`} value={qty} max={max} onChange={onQtyChange} maxReason={maxReason} />
          ) : (
            <Button type="button" variant="outline" size="lg" disabled={max < 1} onClick={() => onQtyChange(1)}>
              Select bed
            </Button>
          )}
        </div>
      )}
      {short && !room.sold_out ? (
        <p role="alert" className="mt-3 text-xs font-medium text-danger-foreground">
          Only {bedsLabel(room.units_left)} left for these dates. Lower the number to continue.
        </p>
      ) : null}
      {room.sold_out && qty > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="min-w-0 text-xs font-medium text-danger-foreground">
            You picked {bedsLabel(qty)} here. Remove them or change dates.
          </p>
          <Button type="button" variant="outline" size="lg" onClick={() => onQtyChange(0)}>
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** Similar places nearby that have beds, shown under a sold-out card. */
export function NearbyAlternatives({ items, hrefFor }: { items: StayAlternative[]; hrefFor: (slug: string) => Route }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-5">
      <p className="text-sm font-semibold">Similar places nearby that have beds</p>
      <ul className="mt-2 divide-y divide-border">
        {items.map((item) => (
          <li key={item.slug}>
            <Link href={hrefFor(item.slug)} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm underline-offset-4 hover:underline">
              <span className="min-w-0 truncate">
                {item.title}
                <span className="text-muted-foreground"> · {item.locality}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                from <Money amount={item.unit_price_from_inr} /> /night
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Seven nights from check-in: free beds and price per night. A night with beds starts the stay there. */
export function SoldOutStrip({
  room,
  onPickNight,
}: {
  room: Pick<StayRoomAvailability, "label" | "unit_price_inr" | "strip">;
  onPickNight: (date: string) => void;
}) {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-danger-foreground">Sold out for these dates</p>
      <p className="mt-1 text-xs text-muted-foreground">Pick a night with beds to start your stay there.</p>
      <ul aria-label={`${room.label}: beds per night`} className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {room.strip.map((night: StayNight) => {
          const free = night.units_left > 0;
          return (
            <li key={night.date} className="min-w-11 flex-1">
              <button
                type="button"
                disabled={!free}
                onClick={() => onPickNight(night.date)}
                aria-label={`${formatWeekday(night.date)} ${formatDayMonth(night.date)}: ${free ? `${bedsLabel(night.units_left)} left` : "full"}`}
                className={cn(
                  "flex min-h-16 w-full flex-col items-center justify-center rounded-xl px-0.5 py-1.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  free ? "cursor-pointer bg-success-surface text-success-foreground hover:ring-1 hover:ring-success-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <span className="text-[0.65rem] font-semibold uppercase">{formatWeekday(night.date)}</span>
                <span className="text-xs font-bold tabular-nums">{formatDayMonth(night.date).split(" ")[0]}</span>
                <span className="text-[0.65rem] font-medium">{free ? `${night.units_left} left` : "Full"}</span>
                {free ? (
                  <span className="text-[0.6rem] tabular-nums">
                    <Money amount={room.unit_price_inr} compact />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
