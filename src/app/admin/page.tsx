import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/features/admin/components/stat-tile";
import { getStats, staffPageContext } from "@/features/admin/service";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Admin overview", robots: { index: false } };

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader title="Overview" description="What needs attention across Zovia." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading overview" />}>
        <OverviewBody />
      </Suspense>
    </>
  );
}

async function OverviewBody() {
  const ctx = await staffPageContext();
  const stats = await getStats(ctx);
  const listingsHref = (status: string) => withQuery(routes.adminProperties, { status });

  return (
    <div className="space-y-8">
      <section aria-labelledby="attention-heading">
        <h2 id="attention-heading" className="mb-4 text-lg font-bold">
          Needs attention
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Listings to review" value={stats.listings.pending_review} href={listingsHref("pending_review")} tone="attention" />
          <StatTile label="New contact messages" value={stats.contact_messages_new} href={routes.adminContactMessages} tone="attention" />
          <StatTile label="Verifications pending" value={stats.verifications_pending} href={routes.adminVerifications} tone="attention" />
        </div>
      </section>
      <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="mb-4 text-lg font-bold">
          Listings
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Published" value={stats.listings.published} href={listingsHref("published")} />
          <StatTile label="In review" value={stats.listings.pending_review} href={listingsHref("pending_review")} />
          <StatTile label="Drafts" value={stats.listings.draft} href={listingsHref("draft")} />
          <StatTile label="Paused" value={stats.listings.paused} href={listingsHref("paused")} />
          <StatTile label="Rejected" value={stats.listings.rejected} href={listingsHref("rejected")} />
          <StatTile label="Archived" value={stats.listings.archived} href={listingsHref("archived")} />
        </div>
      </section>
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="mb-4 text-lg font-bold">
          People
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Users" value={stats.users} href={routes.adminUsers} />
          <StatTile label="Owners" value={stats.owners} href={routes.adminOwners} />
          <StatTile label="Contact messages" value={stats.contact_messages_total} href={routes.adminContactMessages} />
        </div>
      </section>
    </div>
  );
}
