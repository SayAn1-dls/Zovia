import { Gavel } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ModerationQueue } from "@/features/admin/components/moderation-queue";
import { parsePage } from "@/features/admin/schemas";
import { listAppeals, staffPageContext } from "@/features/admin/service";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Appeals", robots: { index: false } };

export default function AdminAppealsPage({ searchParams }: PageProps<"/admin/appeals">) {
  return (
    <>
      <PageHeader title="Appeals" description="Appeals against warnings, restrictions and suspensions." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/appeals">["searchParams"] }) {
  const ctx = await staffPageContext();
  const data = await listAppeals(ctx, parsePage((await searchParams).page));
  return (
    <ModerationQueue
      data={data}
      icon={Gavel}
      emptyTitle="No appeals"
      emptyDescription="Appeals from members appear here."
      notice="Upholding or overturning an appeal needs admin_decide_appeal(), which does not exist in the database yet."
      hrefForPage={(page) => withQuery(routes.adminAppeals, { page })}
    />
  );
}
