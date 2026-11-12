import { CalendarCheck } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ListSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/money";
import { buttonVariants } from "@/components/ui/button";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { listMyBookings } from "@/features/bookings/service";
import { formatDate } from "@/lib/format";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default function BookingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My bookings" description="Requests you sent and homes you have booked." />
      <div className="mt-8">
        <Suspense fallback={<ListSkeleton count={3} />}>
          <BookingsList />
        </Suspense>
      </div>
    </div>
  );
}

async function BookingsList() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref("/bookings"));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const bookings = await listMyBookings({ supabase, user, requestId });

  if (bookings.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No bookings yet"
        description="Find a place you like and tap Request to book."
        action={
          <Link href={routes.search} className={buttonVariants({ size: "lg" })}>
            Find a home
          </Link>
        }
      />
    );
  }

  return (
    <ul className="space-y-3">
      {bookings.map((booking) => (
        <li key={booking.id}>
          <Link
            href={`/bookings/${booking.id}` as Route}
            className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-foreground sm:flex-row sm:items-center sm:justify-between"
          >
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
        </li>
      ))}
    </ul>
  );
}
