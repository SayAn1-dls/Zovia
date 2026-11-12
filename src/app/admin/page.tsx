import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { SignupsChart } from "@/features/admin/components/signups-chart";
import { StatTile } from "@/features/admin/components/stat-tile";
import { getAnalytics, getStats, staffPageContext } from "@/features/admin/service";
import { formatDateTime } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Admin overview", robots: { index: false } };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="Who is joining ZUVIO, how it is being used, and what needs attention." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading overview" />}>
        <OverviewBody />
      </Suspense>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-4 text-lg font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

async function OverviewBody() {
  const ctx = await staffPageContext();
  const [stats, analytics] = await Promise.all([getStats(ctx), getAnalytics(ctx)]);
  const listingsHref = (status: string) => withQuery(routes.adminProperties, { status });
  const listings = analytics.listings_by_status;
  const bookings = analytics.bookings_by_status;
  const bookingsTotal = Object.values(bookings).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-8">
      <Section id="attention-heading" title="Needs attention">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Listings to review" value={listings.pending_review} href={listingsHref("pending_review")} tone="attention" />
          <StatTile label="New contact messages" value={analytics.contact_messages_new} href={routes.adminContactMessages} tone="attention" />
          <StatTile label="Verifications pending" value={stats.verifications_pending} href={routes.adminVerifications} tone="attention" />
        </div>
      </Section>

      <Section id="growth-heading" title="Users">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Total users" value={analytics.users_total} href={routes.adminUsers} />
          <StatTile label="New today" value={analytics.users_new_today} hint="since midnight IST" />
          <StatTile label="New this week" value={analytics.users_new_7d} hint="last 7 days" />
          <StatTile label="New this month" value={analytics.users_new_30d} hint="last 30 days" />
        </div>
        <div className="mt-3">
          <SignupsChart points={analytics.signups_by_day} />
        </div>
      </Section>

      <Section id="listings-heading" title="Listings">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Published" value={listings.published} href={listingsHref("published")} />
          <StatTile label="In review" value={listings.pending_review} href={listingsHref("pending_review")} />
          <StatTile label="Drafts" value={listings.draft} href={listingsHref("draft")} />
          <StatTile label="Paused" value={listings.paused} href={listingsHref("paused")} />
          <StatTile label="Rejected" value={listings.rejected} href={listingsHref("rejected")} />
          <StatTile label="Archived" value={listings.archived} href={listingsHref("archived")} />
        </div>
      </Section>

      <Section id="bookings-heading" title={`Bookings (${bookingsTotal.toLocaleString("en-IN")})`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Requested" value={bookings.requested} />
          <StatTile label="Accepted" value={bookings.accepted} hint="awaiting payment" />
          <StatTile label="Confirmed" value={bookings.confirmed} />
          <StatTile label="Declined" value={bookings.declined} />
          <StatTile label="Expired" value={bookings.expired} />
          <StatTile label="Cancelled" value={bookings.cancelled} />
        </div>
      </Section>

      <Section id="activity-heading" title="Community and activity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Owners" value={analytics.owners} href={routes.adminOwners} />
          <StatTile
            label="Roommate profiles"
            value={analytics.roommate_profiles}
            hint={`${analytics.roommate_profiles_active.toLocaleString("en-IN")} live`}
          />
          <StatTile label="Roommate matches" value={analytics.matches} hint="all time" />
          <StatTile label="Messages" value={analytics.messages_7d} hint="last 7 days" />
          <StatTile label="AI assistant calls" value={analytics.ai_calls_7d} hint="last 7 days" />
          <StatTile label="Contact messages" value={stats.contact_messages_total} href={routes.adminContactMessages} hint="all time" />
        </div>
      </Section>

      <p className="text-xs text-muted-foreground">Counts as of {formatDateTime(analytics.generated_at)}. Day boundaries are India time.</p>
    </div>
  );
}
