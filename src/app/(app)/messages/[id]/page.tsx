import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ChatThread } from "@/features/messaging/components/chat-thread";
import { getConversation, listMessages } from "@/features/messaging/service";
import { dynamicRoutes, routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";
import { isAppError } from "@/server/http/errors";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };

export default function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  return (
    <div>
      <PageHeader back={{ href: routes.messages, label: "All messages" }} title={<span className="sr-only">Conversation</span>} className="mb-2 sm:mb-3" />
      <Suspense fallback={<LoadingState variant="list" count={5} label="Loading conversation" />}>
        <ConversationBody params={params} />
      </Suspense>
    </div>
  );
}

async function ConversationBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(dynamicRoutes.conversation(id)));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const ctx = { supabase, user, requestId };
  const loaded = await Promise.all([getConversation(ctx, id), listMessages(ctx, id, { limit: 30 })]).catch((error: unknown) => {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  });
  const [detail, page] = loaded;
  return <ChatThread detail={detail} initial={page} />;
}
