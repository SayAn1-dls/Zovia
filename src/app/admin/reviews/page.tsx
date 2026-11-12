import { Star } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { RatingStars } from "@/components/rating-stars";
import { StatusBadge } from "@/components/status-badge";
import { parsePage } from "@/features/admin/schemas";
import { listReviews, staffPageContext } from "@/features/admin/service";
import { formatDate } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

export default function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  return (
    <>
      <PageHeader title="Reviews" description="All property reviews, in every status." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading reviews" />}>
        <ReviewsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ReviewsBody({ searchParams }: { searchParams: PageProps<"/admin/reviews">["searchParams"] }) {
  const ctx = await staffPageContext();
  const page = parsePage((await searchParams).page);
  const data = await listReviews(ctx, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <span className="font-semibold">Hiding or removing reviews is not available yet. </span>
        It needs the admin_set_review_status() database function. Reviews are listed read-only.
      </p>
      {data.rows.length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" description="Reviews written by people who enquired about a listing appear here." />
      ) : (
        <ul className="space-y-3" aria-label="Reviews">
          {data.rows.map((review) => (
            <li key={review.id} className="space-y-2 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <RatingStars value={review.rating} />
                <StatusBadge status={review.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {review.author_name} on {review.property_title} · {formatDate(review.created_at)}
              </p>
              {review.title ? <p className="font-semibold">{review.title}</p> : null}
              {review.body ? <p className="text-sm whitespace-pre-line">{review.body}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminReviews, { page: p })} />
    </div>
  );
}
