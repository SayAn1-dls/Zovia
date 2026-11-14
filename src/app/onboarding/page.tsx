import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { OnboardingForm } from "@/features/account/components/onboarding-form";
import { getOwnProfile, listCities } from "@/features/account/service";
import { routes } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  return (
    <>
      <h1 className="text-display-sm font-extrabold text-foreground">Welcome to Zovia.</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">Three quick questions and you are in.</p>
      <div className="mt-10">
        <Suspense fallback={<FormSkeleton count={6} />}>
          <OnboardingBody searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function OnboardingBody({ searchParams }: { searchParams: PageProps<"/onboarding">["searchParams"] }) {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(`${routes.signIn}?next=${encodeURIComponent(routes.onboarding)}`);
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const ctx = { supabase, user, requestId };
  const [profile, cities, params] = await Promise.all([getOwnProfile(ctx), listCities(ctx), searchParams]);
  const next = typeof params.next === "string" ? params.next : undefined;
  return <OnboardingForm profile={profile} cities={cities} next={next} />;
}
