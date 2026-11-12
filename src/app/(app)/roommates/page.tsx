import { Heart, PauseCircle, UserRoundPen, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PauseProfileButton } from "@/features/roommates/components/pause-profile-button";
import { ResumeProfileButton } from "@/features/roommates/components/resume-profile-button";
import { SwipeDeck } from "@/features/roommates/components/swipe-deck";
import { getDeck } from "@/features/roommates/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Find a roommate", robots: { index: false } };

export default function RoommatesPage() {
  return (
    <Suspense fallback={<LoadingState variant="detail" label="Loading your deck" />}>
      <RoommatesBody />
    </Suspense>
  );
}

async function RoommatesBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(routes.roommates));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const deck = await getDeck({ supabase, user, requestId });

  if (deck.state === "no_profile") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Find a roommate" />
        <EmptyState
          icon={Users}
          title="Meet people who live like you"
          description="Create a roommate profile with your budget, area and habits. We show you the most compatible people first; when you both like each other, a chat opens."
          action={
            <Link href={routes.roommateProfile} className={buttonVariants({ size: "lg" })}>
              <UserRoundPen data-icon="inline-start" aria-hidden /> Create your profile
            </Link>
          }
        />
      </div>
    );
  }

  if (deck.state !== "active") {
    const paused = deck.state === "paused";
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Find a roommate" />
        <EmptyState
          icon={paused ? PauseCircle : UserRoundPen}
          title={paused ? "Your profile is paused" : "Finish your profile to start"}
          description={
            paused
              ? "Nobody sees you in their deck while you're paused, and you can't swipe. Your matches and chats are still there."
              : "Add the basics, your budget and a few lifestyle answers, then go live."
          }
          action={
            <>
              <ResumeProfileButton label={paused ? "Go live again" : "Go live"} />
              <Link href={routes.roommateProfile} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <UserRoundPen data-icon="inline-start" aria-hidden /> Edit profile
              </Link>
              <Link href={routes.roommateMatches} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                <Heart data-icon="inline-start" aria-hidden /> Matches
              </Link>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Find a roommate"
        description={`People in ${deck.city ?? "your city"}, best matches first. Like or pass; a match opens a chat.`}
        actions={
          <>
            <Link href={routes.roommateMatches} className={buttonVariants({ size: "lg" })}>
              <Heart data-icon="inline-start" aria-hidden /> Matches
            </Link>
            <Link href={routes.roommateProfile} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <UserRoundPen data-icon="inline-start" aria-hidden /> Profile
            </Link>
            <PauseProfileButton />
          </>
        }
      />
      <SwipeDeck initial={deck.candidates} city={deck.city} />
    </div>
  );
}
