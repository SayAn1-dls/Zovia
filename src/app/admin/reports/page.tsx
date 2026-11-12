import { Flag } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ModerationQueue } from "@/features/admin/components/moderation-queue";
import { parsePage } from "@/features/admin/schemas";
import { listReports, staffPageContext } from "@/features/admin/service";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Reports", robots: { index: false } };

export default function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <>
      <PageHeader title="Reports" description="Reports filed by users about people, listings, profiles, reviews and messages." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/reports">["searchParams"] }) {
  const ctx = await staffPageContext();
  const data = await listReports(ctx, parsePage((await searchParams).page));
  return (
    <ModerationQueue
      data={data}
      icon={Flag}
      emptyTitle="No reports"
      emptyDescription="Reports filed by members appear here."
      notice="Resolving or dismissing a report needs admin_resolve_report(), which does not exist in the database yet."
      hrefForPage={(page) => withQuery(routes.adminReports, { page })}
    />
  );
}
