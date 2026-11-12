import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { AuthCard, authLinkClass } from "@/features/auth/components/auth-card";
import { VerifyEmailPanel } from "@/features/auth/components/verify-email-panel";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Verify your e-mail", robots: { index: false } };

export default function VerifyEmailPage() {
  return (
    <AuthCard
      title="Check your inbox."
      description="Verify your e-mail address to finish creating your account."
      footer={
        <>
          Verified already?{" "}
          <Link href={routes.signIn} className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton count={1} />}>
        <VerifyEmailPanel />
      </Suspense>
    </AuthCard>
  );
}
