import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/form/form-field";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PhotoManager } from "@/features/roommates/components/photo-manager";
import { RoommateProfileForm } from "@/features/roommates/components/profile-form";
import { getOwnProfile, listCities, listQuestions } from "@/features/roommates/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Roommate profile", robots: { index: false } };

export default function RoommateProfilePage() {
  return (
    <div className="mx-auto max-w-6xl">
      <Suspense fallback={<LoadingState variant="form" count={8} label="Loading your profile" />}>
        <ProfileBody />
      </Suspense>
    </div>
  );
}

async function ProfileBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(routes.roommateProfile));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const ctx = { supabase, user, requestId };
  const [profile, questions, cities] = await Promise.all([getOwnProfile(ctx), listQuestions(ctx), listCities(ctx)]);

  return (
    <>
      <PageHeader
        back={{ href: routes.roommates, label: "Roommates" }}
        title={profile.exists ? "Your roommate profile" : "Create your roommate profile"}
        description="Honest answers lead to better matches. Your contact details are never shown."
      />
      <RoommateProfileForm
        initial={profile.values}
        exists={profile.exists}
        questions={questions}
        cities={cities}
        displayName={profile.display_name}
        photoUrls={profile.photos.flatMap((photo) => (photo.url ? [photo.url] : []))}
        header={
          profile.exists ? (
            <PhotoManager userId={user.id} photos={profile.photos} />
          ) : (
            <FormMessage tone="info">You can add photos after you create your profile.</FormMessage>
          )
        }
      />
    </>
  );
}
