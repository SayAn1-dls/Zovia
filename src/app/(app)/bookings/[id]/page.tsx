import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { DetailSkeleton } from "@/components/feedback/loading-state";
import { FormMessage } from "@/components/form/form-field";
import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/money";
import { CancelBookingButton } from "@/features/bookings/components/booking-actions";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status";
import { PayButton } from "@/features/bookings/components/pay-button";
import { AMOUNT_KIND_LABELS } from "@/features/bookings/schemas";
import { getBooking } from "@/features/bookings/service";
import { formatDate, formatDateTime } from "@/lib/format";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext } from "@/server/auth";
import { isAppError } from "@/server/http/errors";

export const metadata: Metadata = { title: "Booking", robots: { index: false } };

export default function BookingPage({ params }: PageProps<"/bookings/[id]">) {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Booking" back={{ href: "/bookings" as Route, label: "My bookings" }} />
      <div className="mt-6">
        <Suspense fallback={<DetailSkeleton />}>
          <BookingBody params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function BookingBody({ params }: { params: PageProps<"/bookings/[id]">["params"] }) {
  const { id } = await params;
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(`/bookings/${id}`));
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const booking = await getBooking({ supabase, user, requestId }, id).catch((error: unknown) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const isSeeker = booking.seeker_id === user.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={`/properties/${booking.property.slug}` as Route} className="text-lg font-bold underline-offset-4 hover:underline">
          {booking.property.title}
        </Link>
        <BookingStatusBadge status={booking.status} />
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-5 text-sm">
        <div>
          <dt className="text-muted-foreground">Move in</dt>
          <dd className="font-semibold">{formatDate(booking.move_in_date)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Stay</dt>
          <dd className="font-semibold">{booking.stay_months} months</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Bed</dt>
          <dd className="font-semibold">{[booking.room_name, booking.bed_label].filter(Boolean).join(" · ") || "Whole home"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Monthly rent</dt>
          <dd className="font-semibold">
            <Money amount={booking.monthly_rent_inr} />
          </dd>
        </div>
        <div className="col-span-2 border-t border-border pt-4">
          <dt className="text-muted-foreground">{AMOUNT_KIND_LABELS[booking.amount_kind]} to confirm</dt>
          <dd className="text-lg font-bold">
            <Money amount={booking.amount_inr} />
            {booking.paid ? <span className="ml-2 text-sm font-semibold text-success-foreground">Paid</span> : null}
          </dd>
        </div>
      </dl>

      {booking.status === "requested" ? (
        <FormMessage tone="info">The owner has until {formatDateTime(booking.respond_by)} to answer. You are not charged until they accept.</FormMessage>
      ) : null}
      {booking.status === "accepted" && !booking.paid ? (
        <div className="space-y-3">
          <FormMessage tone="success" title="The owner accepted">
            Pay {booking.pay_by ? `before ${formatDateTime(booking.pay_by)}` : "now"} to confirm your booking.
          </FormMessage>
          {isSeeker ? <PayButton bookingId={booking.id} /> : null}
        </div>
      ) : null}
      {booking.status === "confirmed" ? (
        <FormMessage tone="success" title="Booking confirmed">
          See you on {formatDate(booking.move_in_date)}. Keep your payment receipt from Razorpay.
        </FormMessage>
      ) : null}
      {booking.status === "declined" && booking.decline_reason ? (
        <FormMessage tone="warning" title="The owner declined">{booking.decline_reason}</FormMessage>
      ) : null}

      {isSeeker && (booking.status === "requested" || (booking.status === "accepted" && !booking.paid)) ? <CancelBookingButton bookingId={booking.id} /> : null}

      <p className="text-sm text-muted-foreground">
        Questions? <Link href={routes.contact} className="underline underline-offset-4">Contact us</Link>.
      </p>
    </div>
  );
}
