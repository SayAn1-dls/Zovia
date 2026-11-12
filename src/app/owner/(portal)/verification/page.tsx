import { FileCheck2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { VerifiedBadge, verificationSignals } from "@/components/verified-badge";
import { ownerPageContext } from "@/features/owner/page-context";
import { getOwnerAccount, listVerificationRecords } from "@/features/owner/service";
import { formatDate } from "@/lib/format";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Verification", robots: { index: false } };

const KIND_LABELS: Record<string, string> = {
  government_id: "Government ID",
  ownership_proof: "Proof of ownership",
  authorisation_letter: "Authorisation letter",
  utility_bill: "Utility bill",
  business_registration: "Business registration",
};

export default function OwnerVerificationPage() {
  return (
    <>
      <PageHeader title="Verification" description="Three separate trust signals. Each one is earned on its own." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading verification" />}>
        <VerificationBody />
      </Suspense>
    </>
  );
}

async function VerificationBody() {
  const ctx = await ownerPageContext(routes.ownerVerification);
  const [account, records] = await Promise.all([getOwnerAccount(ctx), listVerificationRecords(ctx)]);

  return (
    <div className="space-y-8">
      <ul className="grid gap-4 lg:grid-cols-3">
        {(["owner", "authorisation", "recently_confirmed"] as const).map((kind) => (
          <li key={kind} className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
            <VerifiedBadge kind={kind} />
            <p className="text-sm text-muted-foreground">{verificationSignals[kind].description}</p>
            {kind === "owner" ? (
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Your status: <StatusBadge status={account?.verification_status ?? "unverified"} />
                {account?.verified_at ? <span className="text-muted-foreground">since {formatDate(account.verified_at)}</span> : null}
              </p>
            ) : kind === "authorisation" ? (
              <p className="text-sm font-medium">Shown per listing once our team has checked it.</p>
            ) : (
              <p className="text-sm font-medium">Use “Confirm still accurate” on a live listing every month.</p>
            )}
          </li>
        ))}
      </ul>

      <section aria-labelledby="documents-heading" className="space-y-4">
        <h2 id="documents-heading" className="text-lg font-bold">
          Documents
        </h2>
        <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
          Uploading identity and ownership documents is not open yet: the secure document storage it needs is still being set up. Until then
          your account shows as not verified, which is never hidden from seekers. Nothing else about your listings is affected.
        </p>
        {records.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border">
            {records.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{KIND_LABELS[record.kind] ?? record.kind}</p>
                  <p className="text-sm text-muted-foreground">Submitted {formatDate(record.created_at)}</p>
                  {record.review_note ? <p className="mt-1 text-sm">{record.review_note}</p> : null}
                </div>
                <StatusBadge status={record.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={FileCheck2} title="No documents submitted" description="Your submitted documents and their review status will be listed here." />
        )}
      </section>
    </div>
  );
}
