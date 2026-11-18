"use client";

import { CalendarCheck, RotateCw } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { FormMessage } from "@/components/form/form-field";
import { Money } from "@/components/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import type { Booking } from "@/features/bookings/schemas";
import { formatDate } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";

import type { StayBooking } from "../schemas";
import { formatStayDate, nightsLabel } from "../hooks/stay-text";
import { useStayBookings } from "../hooks/use-stays";
import { StayStatusBadge } from "./stay-status";

type Row = { kind: "stay"; created_at: string; booking: StayBooking } | { kind: "legacy"; created_at: string; booking: Booking };

/** Stay bookings and old long-stay bookings in one list, newest first. */
export function mergeBookings(stays: readonly StayBooking[], legacy: readonly Booking[]): Row[] {
  return [
    ...stays.map((booking) => ({ kind: "stay" as const, created_at: booking.created_at, booking })),
    ...legacy.map((booking) => ({ kind: "legacy" as const, created_at: booking.created_at, booking })),
  ].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

const rowClass =
  "flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between";

function StayRow({ booking }: { booking: StayBooking }) {
  return (
    <Link href={dynamicRoutes.booking(booking.id)} className={rowClass}>
      <div className="min-w-0">
        <p className="truncate font-semibold">{booking.listing_title}</p>
        <p className="text-sm text-muted-foreground">
          {formatStayDate(booking.checkin)} → {formatStayDate(booking.checkout)} · {nightsLabel(booking.nights)} ·{" "}
          {booking.guests === 1 ? "1 bed" : `${booking.guests} beds`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Money amount={booking.grand_total_inr} className="text-sm font-semibold" />
        <StayStatusBadge status={booking.status} />
      </div>
    </Link>
  );
}

function LegacyRow({ booking }: { booking: Booking }) {
  return (
    <Link href={dynamicRoutes.booking(booking.id)} className={rowClass}>
      <div className="min-w-0">
        <p className="truncate font-semibold">{booking.property.title}</p>
        <p className="text-sm text-muted-foreground">
          {[booking.room_name, booking.bed_label].filter(Boolean).join(" · ") || "Whole home"} · from {formatDate(booking.move_in_date)}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Money amount={booking.monthly_rent_inr} suffix="/mo" className="text-sm font-semibold" />
        <BookingStatusBadge status={booking.status} />
      </div>
    </Link>
  );
}

export function BookingsTimeline({ legacy }: { legacy: Booking[] }) {
  const stays = useStayBookings();
  const rows = mergeBookings(stays.data ?? [], legacy);

  if (!stays.isPending && rows.length === 0 && !stays.isError) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No bookings yet"
        description="Find a place you like, pick your dates and beds, and tap Book now."
        action={
          <Link href={routes.cities} className={buttonVariants({ size: "lg" })}>
            Find a home
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {stays.isError ? (
        <FormMessage tone="danger">
          <span className="flex flex-wrap items-center justify-between gap-2">
            Your stay bookings did not load.
            <Button type="button" variant="outline" size="sm" onClick={() => void stays.refetch()}>
              <RotateCw data-icon="inline-start" aria-hidden />
              Try again
            </Button>
          </span>
        </FormMessage>
      ) : null}
      <ul className="space-y-3">
        {stays.isPending ? (
          <li role="status" aria-busy="true">
            <span className="sr-only">Loading stay bookings</span>
            <Skeleton className="h-20 w-full rounded-2xl" />
          </li>
        ) : null}
        {rows.map((row) => (
          <li key={`${row.kind}-${row.booking.id}`}>{row.kind === "stay" ? <StayRow booking={row.booking} /> : <LegacyRow booking={row.booking} />}</li>
        ))}
      </ul>
    </div>
  );
}
