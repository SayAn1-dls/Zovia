import { BarChart3, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { VerifiedBadge } from "@/components/verified-badge";
import { InquiryList } from "@/features/owner/components/inquiry-list";
import { StatTile } from "@/features/owner/components/stat-tile";
import { ownerPageContext } from "@/features/owner/page-context";
import { getDashboard } from "@/features/owner/service";
import { formatNumber } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Owner overview", robots: { index: false } };

export default function OwnerOverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Your listings, enquiries and how they are doing."
        actions={
          <Link href={routes.ownerNewProperty} className={buttonVariants({ size: "lg" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Add a property
          </Link>
        }
      />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading overview" />}>
        <OverviewBody />
      </Suspense>
    </>
  );
}

async function OverviewBody() {
  const ctx = await ownerPageContext(routes.owner);
  const data = await getDashboard(ctx);
  const { counts, account } = data;
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-10">
      <section aria-labelledby="verification-heading" className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <h2 id="verification-heading" className="text-sm font-semibold text-muted-foreground">
            Owner verification
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {account.verification_status === "verified" ? <VerifiedBadge kind="owner" /> : <StatusBadge status={account.verification_status} />}
          </div>
        </div>
        <Link href={routes.ownerVerification} className={buttonVariants({ variant: "outline", size: "lg" })}>
          {account.verification_status === "verified" ? "View details" : "How verification works"}
        </Link>
      </section>

      <section aria-labelledby="listings-heading">
        <h2 id="listings-heading" className="mb-4 text-lg font-bold">
          Listings
        </h2>
        {total === 0 ? (
          <EmptyState
            title="No listings yet"
            description="Create your first listing. Save it as a draft and finish it whenever you like."
            action={
              <Link href={routes.ownerNewProperty} className={buttonVariants({ size: "lg" })}>
                Add a property
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatTile label="Published" value={counts.published} href={routes.ownerProperties} />
            <StatTile label="In review" value={counts.pending_review} href={routes.ownerProperties} />
            <StatTile label="Drafts" value={counts.draft} href={routes.ownerProperties} />
            <StatTile label="Paused" value={counts.paused} href={routes.ownerProperties} />
            <StatTile label="Rejected" value={counts.rejected} href={routes.ownerProperties} tone="attention" />
            <StatTile label="New enquiries" value={data.new_inquiries} href={routes.ownerInquiries} tone="attention" />
          </div>
        )}
      </section>

      <section aria-labelledby="enquiries-heading">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="enquiries-heading" className="text-lg font-bold">
            Recent enquiries
          </h2>
          {data.recent_inquiries.length ? (
            <Link href={routes.ownerInquiries} className="text-sm font-semibold underline underline-offset-4">
              See all
            </Link>
          ) : null}
        </div>
        <InquiryList inquiries={data.recent_inquiries} compact />
      </section>

      <section aria-labelledby="performance-heading">
        <h2 id="performance-heading" className="mb-1 text-lg font-bold">
          Listing performance
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">Last {data.performance_days} days.</p>
        {data.performance.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="No activity recorded yet"
            description="Views, saves and enquiries are counted once your listings are live and people find them."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th scope="col" className="p-4 font-semibold">Listing</th>
                  <th scope="col" className="p-4 text-right font-semibold">Views</th>
                  <th scope="col" className="p-4 text-right font-semibold">Saves</th>
                  <th scope="col" className="p-4 text-right font-semibold">Enquiries</th>
                  <th scope="col" className="p-4 text-right font-semibold">Contact views</th>
                </tr>
              </thead>
              <tbody>
                {data.performance.map((row) => (
                  <tr key={row.property_id} className="border-b border-border last:border-0">
                    <td className="p-4 font-medium">
                      <Link href={dynamicRoutes.ownerProperty(row.property_id)} className="hover:underline">
                        {row.title}
                      </Link>
                    </td>
                    <td className="p-4 text-right tabular-nums">{formatNumber(row.views)}</td>
                    <td className="p-4 text-right tabular-nums">{formatNumber(row.saves)}</td>
                    <td className="p-4 text-right tabular-nums">{formatNumber(row.inquiries)}</td>
                    <td className="p-4 text-right tabular-nums">{formatNumber(row.contact_reveals)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
