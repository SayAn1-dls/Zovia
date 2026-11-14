import { CalendarCheck } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { Money } from "@/components/money";
import { formatDate, formatDateTime } from "@/lib/format";

import type { Booking } from "../schemas";
import { AMOUNT_KIND_LABELS } from "../schemas";
import { CancelBookingButton, RespondBookingButtons } from "./booking-actions";
import { BookingStatusBadge } from "./booking-status";

/** Booking requests on the owner's listings, newest first, with accept / decline. */
export function OwnerBookingsList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No booking requests yet"
        description="When someone requests a bed or your home, it shows up here for you to accept or decline."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {bookings.map((booking) => (
        <li key={booking.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link href={`/properties/${booking.property.slug}` as Route} className="font-semibold underline-offset-4 hover:underline">
                {booking.property.title}
              </Link>
              <p className="text-sm text-muted-foreground">
                {booking.seeker_name ?? "A Zovia member"} · {[booking.room_name, booking.bed_label].filter(Boolean).join(" · ") || "Whole home"}
              </p>
            </div>
            <BookingStatusBadge status={booking.status} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Move in</dt>
              <dd className="font-medium">{formatDate(booking.move_in_date)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stay</dt>
              <dd className="font-medium">{booking.stay_months} months</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rent</dt>
              <dd className="font-medium">
                <Money amount={booking.monthly_rent_inr} suffix="/mo" />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{AMOUNT_KIND_LABELS[booking.amount_kind]}</dt>
              <dd className="font-medium">
                <Money amount={booking.amount_inr} /> {booking.paid ? "· paid" : ""}
              </dd>
            </div>
          </dl>
          {booking.note ? <p className="rounded-xl bg-muted/60 p-3 text-sm">&ldquo;{booking.note}&rdquo;</p> : null}
          {booking.status === "requested" ? (
            <>
              <p className="text-xs text-muted-foreground">Answer by {formatDateTime(booking.respond_by)}.</p>
              <RespondBookingButtons bookingId={booking.id} />
            </>
          ) : null}
          {booking.status === "accepted" && !booking.paid ? (
            <>
              <p className="text-xs text-muted-foreground">Waiting for the seeker to pay{booking.pay_by ? ` by ${formatDateTime(booking.pay_by)}` : ""}.</p>
              <CancelBookingButton bookingId={booking.id} />
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
