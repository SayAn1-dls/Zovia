import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { InquiryList } from "@/features/owner/components/inquiry-list";
import { ownerPageContext } from "@/features/owner/page-context";
import { listInquiries } from "@/features/owner/service";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Enquiries", robots: { index: false } };

export default function OwnerInquiriesPage() {
  return (
    <>
      <PageHeader title="Enquiries" description="People asking about your listings. An enquiry is never a booking." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading enquiries" />}>
        <InquiriesBody />
      </Suspense>
    </>
  );
}

async function InquiriesBody() {
  const ctx = await ownerPageContext(routes.ownerInquiries);
  const inquiries = await listInquiries(ctx);
  return (
    <div className="space-y-4">
      <InquiryList inquiries={inquiries} />
      {inquiries.length ? (
        <p className="text-sm text-muted-foreground">
          Replying in the chat marks an enquiry as responded. Closing an enquiry or marking it as spam is not available yet.
        </p>
      ) : null}
    </div>
  );
}
