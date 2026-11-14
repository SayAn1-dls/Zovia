import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { OwnerAccountForm } from "@/features/owner/components/owner-account-form";
import { ownerPageContext } from "@/features/owner/page-context";
import { routes } from "@/lib/navigation";
import { hasRole } from "@/server/auth";

export const metadata: Metadata = { title: "List your property", robots: { index: false } };

export default function OwnerOnboardingPage() {
  return (
    <>
      <h1 className="text-display-sm font-extrabold text-foreground">List your property on Zovia.</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">
        Tell us how to reach you. It is free; your listing goes live after a quick review by our team.
      </p>
      <div className="mt-10">
        <Suspense fallback={<FormSkeleton count={5} />}>
          <OnboardingBody />
        </Suspense>
      </div>
    </>
  );
}

async function OnboardingBody() {
  const ctx = await ownerPageContext(routes.ownerOnboarding, { allowNonOwner: true });
  if (hasRole(ctx.user, "owner")) redirect(routes.owner);
  return <OwnerAccountForm mode="onboarding" account={null} />;
}
