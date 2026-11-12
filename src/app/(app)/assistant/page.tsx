import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { AssistantChat } from "@/features/assistant/components/assistant-chat";
import { getAssistantStatus } from "@/features/assistant/service";
import { routes } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Assistant", robots: { index: false } };

/** /assistant (private; the proxy guards it and the body re-checks the session inside Suspense). */
export default function AssistantPage() {
  return (
    <>
      <PageHeader
        title="Assistant"
        description="Describe the place you need. Answers use real ZUVIO listings only."
      />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading the assistant" />}>
        <AssistantBody />
      </Suspense>
    </>
  );
}

async function AssistantBody() {
  const ctx = await getServiceContext();
  if (!ctx.user) redirect(`${routes.signIn}?next=${encodeURIComponent(routes.assistant)}`);
  if (!isActiveStatus(ctx.user.status)) redirect(routes.accountSuspended);
  return <AssistantChat initialMode={getAssistantStatus().mode} />;
}
