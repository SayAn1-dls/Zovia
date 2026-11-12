import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { listNotifications } from "@/features/notifications/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Notifications", robots: { index: false } };

export default function NotificationsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Notifications" />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading notifications" />}>
        <NotificationsBody />
      </Suspense>
    </div>
  );
}

async function NotificationsBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(routes.notifications));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const page = await listNotifications({ supabase, user, requestId }, { limit: 20, unread: false });
  return <NotificationList me={user.id} initial={page} />;
}
