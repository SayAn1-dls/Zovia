import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { parsePage } from "@/features/admin/schemas";
import { listAuditLogs, staffPageContext } from "@/features/admin/service";
import { formatDateTime } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };

export default function AdminAuditLogPage({ searchParams }: PageProps<"/admin/audit-logs">) {
  return (
    <>
      <PageHeader title="Audit log" description="Every staff and system action, newest first. Append-only." />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading audit log" />}>
        <AuditBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function AuditBody({ searchParams }: { searchParams: PageProps<"/admin/audit-logs">["searchParams"] }) {
  const ctx = await staffPageContext();
  const page = parsePage((await searchParams).page);
  const data = await listAuditLogs(ctx, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-5">
      {data.rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="No actions logged yet" description="Approvals, rejections and other staff actions are recorded here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Audit log">
          {data.rows.map((row) => (
            <li key={row.id} className="space-y-1 p-4">
              <p className="flex flex-wrap items-center gap-x-2 text-sm">
                <span className="font-mono font-semibold">{row.action}</span>
                <span className="text-muted-foreground">by {row.actor_name}</span>
              </p>
              <p className="text-xs break-all text-muted-foreground">
                {row.entity_type} {row.entity_id ?? ""} · {formatDateTime(row.created_at)}
              </p>
              {row.details && typeof row.details === "object" && Object.keys(row.details).length ? (
                <pre className="overflow-x-auto rounded-lg bg-muted p-2 text-xs">{JSON.stringify(row.details, null, 2)}</pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminAuditLogs, { page: p })} />
    </div>
  );
}
