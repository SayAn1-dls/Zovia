import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ModerationQueue } from "@/features/admin/components/moderation-queue";
import { parsePage } from "@/features/admin/schemas";
import { listMessageReports, staffPageContext } from "@/features/admin/service";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Message reports", robots: { index: false } };

export default function AdminMessageReportsPage({ searchParams }: PageProps<"/admin/message-reports">) {
  return (
    <>
      <PageHeader title="Message reports" description="Chat messages reported by the people who received them." />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/admin/message-reports">["searchParams"] }) {
  const ctx = await staffPageContext();
  const data = await listMessageReports(ctx, parsePage((await searchParams).page));
  return (
    <ModerationQueue
      data={data}
      icon={MessageCircle}
      emptyTitle="No message reports"
      emptyDescription="Reported chat messages appear here."
      notice="Resolving a message report needs admin_resolve_message_report(), which does not exist in the database yet."
      hrefForPage={(page) => withQuery(routes.adminMessageReports, { page })}
    />
  );
}
