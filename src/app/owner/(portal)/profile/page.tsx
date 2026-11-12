import type { Metadata } from "next";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Panel } from "@/features/owner/components/bits";
import { OwnerAccountForm } from "@/features/owner/components/owner-account-form";
import { ownerPageContext } from "@/features/owner/page-context";
import { getOwnerAccount } from "@/features/owner/service";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Owner profile", robots: { index: false } };

export default function OwnerProfilePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Owner profile"
        description="How seekers see you, and how they reach you. Your phone is shared only with people who enquire or ask to see it."
      />
      <Suspense fallback={<FormSkeleton count={6} />}>
        <ProfileBody />
      </Suspense>
    </div>
  );
}

async function ProfileBody() {
  const ctx = await ownerPageContext(routes.ownerProfile);
  const account = await getOwnerAccount(ctx);
  return (
    <Panel>
      <OwnerAccountForm mode="profile" account={account} />
    </Panel>
  );
}
