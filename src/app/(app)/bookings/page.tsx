import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ListSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { listMyBookings } from "@/features/bookings/service";
import { BookingsTimeline } from "@/features/stays/components/bookings-timeline";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "My bookings", robots: { index: false } };

export default function BookingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My bookings" description="Stays you booked and requests you sent, newest first." />
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
  return <BookingsTimeline legacy={bookings} />;
}
