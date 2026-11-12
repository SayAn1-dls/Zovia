import { Heart, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { MatchesList } from "@/features/roommates/components/matches-list";
import { listMatches } from "@/features/roommates/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Your matches", robots: { index: false } };

export default function MatchesPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: routes.roommates, label: "Roommates" }}
        title="Your matches"
        description="People who liked you back. A match is a chance to talk, never a booking."
      />
      <Suspense fallback={<LoadingState variant="list" count={4} label="Loading matches" />}>
        <MatchesBody />
      </Suspense>
    </div>
  );
}

async function MatchesBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(routes.roommateMatches));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const matches = await listMatches({ supabase, user, requestId });
  if (matches.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="No matches yet"
        description="When someone you liked likes you back, they show up here and a chat opens."
        action={
          <Link href={routes.roommates} className={buttonVariants({ size: "lg" })}>
            <Users data-icon="inline-start" aria-hidden /> Keep swiping
          </Link>
        }
      />
    );
  }
  return <MatchesList matches={matches} />;
}
