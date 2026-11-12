import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { OwnerBookingsList } from "@/features/bookings/components/owner-bookings-list";
import { listOwnerBookings } from "@/features/bookings/service";
import { ownerPageContext } from "@/features/owner/page-context";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Bookings", robots: { index: false } };

export default function OwnerBookingsPage() {
  return (
    <>
      <PageHeader title="Bookings" description="Requests to book your beds or homes. Accept to let the seeker pay and confirm." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading bookings" />}>
        <BookingsBody />
      </Suspense>
    </>
  );
}

async function BookingsBody() {
  const ctx = await ownerPageContext(routes.ownerBookings);
  return <OwnerBookingsList bookings={await listOwnerBookings(ctx)} />;
}
