import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { parsePage } from "@/features/admin/schemas";
import { listOwners, staffPageContext } from "@/features/admin/service";
import { formatDate } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Owners", robots: { index: false } };

export default function AdminOwnersPage({ searchParams }: PageProps<"/admin/owners">) {
  return (
    <>
      <PageHeader title="Owners" description="Registered owners and operators with their verification status. Read-only." />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading owners" />}>
        <OwnersBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function OwnersBody({ searchParams }: { searchParams: PageProps<"/admin/owners">["searchParams"] }) {
  const ctx = await staffPageContext();
  const page = parsePage((await searchParams).page);
  const data = await listOwners(ctx, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-5">
      {data.rows.length === 0 ? (
        <EmptyState icon={Building2} title="No owners yet" description="People who register to list a property appear here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Owners">
          {data.rows.map((owner) => (
            <li key={owner.user_id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold break-words">{owner.business_name ?? owner.display_name}</p>
                <p className="text-sm break-all text-muted-foreground">
                  {owner.email ?? "No e-mail"} · {owner.contact_phone ?? "no phone"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={owner.verification_status} />
                <span className="text-xs text-muted-foreground capitalize">{owner.owner_type.replace(/_/g, " ")}</span>
                <span className="text-xs text-muted-foreground">since {formatDate(owner.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminOwners, { page: p })} />
    </div>
  );
}
