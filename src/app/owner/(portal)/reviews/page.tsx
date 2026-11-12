import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ReviewList } from "@/features/owner/components/review-list";
import { ownerPageContext } from "@/features/owner/page-context";
import { listReviews } from "@/features/owner/service";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Reviews", robots: { index: false } };

export default function OwnerReviewsPage() {
  return (
    <>
      <PageHeader title="Reviews" description="What tenants and enquirers say about your listings. You can reply once, publicly, to each review." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading reviews" />}>
        <ReviewsBody />
      </Suspense>
    </>
  );
}

async function ReviewsBody() {
  const ctx = await ownerPageContext(routes.ownerReviews);
  return <ReviewList reviews={await listReviews(ctx)} />;
}
