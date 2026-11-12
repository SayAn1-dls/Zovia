import { BedDouble, ImageOff } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge, statusPresets } from "@/components/status-badge";
import { listListings, staffPageContext } from "@/features/admin/service";
import { REVIEW_QUEUE_STATUSES, parsePage, parseQueueStatus } from "@/features/admin/schemas";
import { formatDateTime } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Listings", robots: { index: false } };

export default function AdminListingsPage({ searchParams }: PageProps<"/admin/properties">) {
  return (
    <>
      <PageHeader title="Listings" description="Review queue first: approving a listing is what makes it live." />
      <Suspense fallback={<LoadingState variant="list" count={5} label="Loading listings" />}>
        <ListingsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ListingsBody({ searchParams }: { searchParams: PageProps<"/admin/properties">["searchParams"] }) {
  const ctx = await staffPageContext();
  const query = await searchParams;
  const status = parseQueueStatus(query.status);
  const page = parsePage(query.page);
  const data = await listListings(ctx, status, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-5">
      <nav aria-label="Listing status" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex w-max gap-2">
          {REVIEW_QUEUE_STATUSES.map((value) => (
            <li key={value}>
              <Link
                href={withQuery(routes.adminProperties, { status: value })}
                aria-current={value === status ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap",
                  value === status ? "border-ink bg-ink text-white" : "border-foreground/20 bg-card hover:border-foreground",
                )}
              >
                {value === "pending_review" ? "Review queue" : statusPresets[value].label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {data.rows.length === 0 ? (
        <EmptyState
          icon={BedDouble}
          title={status === "pending_review" ? "The review queue is empty" : "No listings here"}
          description={status === "pending_review" ? "New submissions appear here, oldest first." : "Nothing has this status right now."}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Listings">
          {data.rows.map((row) => (
            <li key={row.id} data-testid="admin-listing">
              <Link href={`/admin/properties/${row.id}` as Route} className="flex gap-3 p-4 hover:bg-muted/50 sm:gap-4">
                <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-20">
                  {row.cover_url ? (
                    // Owner upload from the public bucket.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.cover_url} alt="" className="size-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-5" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={row.status} />
                  </span>
                  <span className="block font-semibold break-words">{row.title}</span>
                  <span className="block text-sm break-words text-muted-foreground">
                    {[row.locality, row.city].filter(Boolean).join(", ") || "No address"} · by {row.owner_name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {row.submitted_at ? `Submitted ${formatDateTime(row.submitted_at)}` : `Updated ${formatDateTime(row.updated_at)}`}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminProperties, { status, page: p })} />
    </div>
  );
}
