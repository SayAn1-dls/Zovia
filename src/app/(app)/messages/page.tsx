import { MessageCircle, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { ConversationList } from "@/features/messaging/components/conversation-list";
import { listConversations } from "@/features/messaging/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Messages" description="Chats with your roommate matches and property owners." />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading conversations" />}>
        <MessagesBody />
      </Suspense>
    </div>
  );
}

async function MessagesBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(routes.messages));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const { items } = await listConversations({ supabase, user, requestId }, { limit: 50, offset: 0 });
  if (items.length === 0) {
    return (
      <EmptyState
        icon={MessageCircle}
        title="No conversations yet"
        description="Match with a roommate or send an enquiry about a home, and your chats will appear here."
        action={
          <Link href={routes.roommates} className={buttonVariants({ size: "lg" })}>
            <Users data-icon="inline-start" aria-hidden /> Find a roommate
          </Link>
        }
      />
    );
  }
  return <ConversationList me={user.id} initial={items} />;
}
