import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { getCatalogListing } from "@/features/catalog/listings";
import { createStayPayments } from "@/features/stays/payment";
import { StayCheckout } from "@/features/stays/components/stay-checkout";
import { dynamicRoutes, routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Book your stay", robots: { index: false } };

/**
 * /book/[slug]?checkin=&checkout=&rooms= (private: the proxy sends signed-out visitors to sign-in
 * and back here). The stay itself is read from the URL in the browser and priced by the server.
 */
export default function BookPage({ params }: PageProps<"/book/[slug]">) {
  return (
    <div className="mx-auto max-w-5xl">
      <Suspense fallback={<LoadingState variant="form" label="Loading checkout" />}>
        <BookBody params={params} />
      </Suspense>
    </div>
  );
}

async function BookBody({ params }: { params: PageProps<"/book/[slug]">["params"] }) {
  const { slug } = await params;
  const listing = getCatalogListing(slug);
  if (!listing) notFound();
  const { user } = await getServiceContext();
  if (!user) redirect(signInHref(`/book/${slug}`));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);

  return (
    <>
      <PageHeader
        title="Confirm your stay"
        description="Check the details, add the guest, and confirm."
        back={{ href: dynamicRoutes.property(listing.slug), label: listing.title }}
      />
      <StayCheckout
        listing={{ slug: listing.slug, title: listing.title, place: `${listing.locality}, ${listing.city}` }}
        defaults={{ name: "", email: user.email ?? "" }}
        expectedMode={createStayPayments().configured() ? "online" : "at_property"}
      />
    </>
  );
}
