import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { parsePage } from "@/features/admin/schemas";
import { listVerifications, staffPageContext } from "@/features/admin/service";
import { formatDateTime } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Verifications", robots: { index: false } };

export default function AdminVerificationsPage({ searchParams }: PageProps<"/admin/verifications">) {
  return (
    <>
      <PageHeader title="Verifications" description="Identity and ownership documents submitted by owners." />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading verifications" />}>
        <VerificationsBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function VerificationsBody({ searchParams }: { searchParams: PageProps<"/admin/verifications">["searchParams"] }) {
  const ctx = await staffPageContext();
  const page = parsePage((await searchParams).page);
  const data = await listVerifications(ctx, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <span className="font-semibold">Review is not available yet. </span>
        Deciding needs admin_review_verification() and the private verification-documents bucket, neither of which exists yet. Submissions
        are listed read-only.
      </p>
      {data.rows.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No submissions" description="Owner and property documents waiting for review will appear here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Verification submissions">
          {data.rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div>
                <p className="font-semibold">
                  {row.kind.replace(/_/g, " ")} · {row.subject_type}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.submitter_name} · {formatDateTime(row.created_at)}
                </p>
              </div>
              <StatusBadge status={row.status} />
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminVerifications, { page: p })} />
    </div>
  );
}
