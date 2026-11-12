import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { ProfileForm } from "@/features/account/components/profile-form";
import { getOwnProfile } from "@/features/account/service";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { routes } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Settings" description="Your profile and sign-in details." />
      <div className="mt-8 space-y-12">
        <Suspense fallback={<FormSkeleton count={6} />}>
          <SettingsBody />
        </Suspense>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <h2 className="mb-5 text-lg font-bold text-foreground">{children}</h2>;
}

async function SettingsBody() {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(`${routes.signIn}?next=${encodeURIComponent(routes.settings)}`);
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const profile = await getOwnProfile({ supabase, user, requestId });

  return (
    <>
      <section>
        <SectionTitle>Profile</SectionTitle>
        <ProfileForm profile={profile} />
      </section>
      <section>
        <SectionTitle>E-mail</SectionTitle>
        <p className="text-[0.9375rem] break-all text-foreground">{profile.email ?? "No e-mail on file"}</p>
      </section>
      <section>
        <SectionTitle>Change password</SectionTitle>
        <ResetPasswordForm doneHref={routes.settings} />
      </section>
    </>
  );
}
