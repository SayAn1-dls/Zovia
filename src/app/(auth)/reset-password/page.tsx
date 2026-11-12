import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { FormMessage } from "@/components/form/form-field";
import { buttonVariants } from "@/components/ui/button";
import { AuthCard } from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { routes } from "@/lib/navigation";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Reached from the recovery e-mail (via /auth/confirm, which created the session). */
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password." description="You will use it the next time you sign in.">
      <Suspense fallback={<FormSkeleton count={2} />}>
        <ResetPasswordBody />
      </Suspense>
    </AuthCard>
  );
}

async function ResetPasswordBody() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="space-y-5">
        <FormMessage tone="warning" title="This link has expired">
          Reset links work once and only for a short time. Request a new one.
        </FormMessage>
        <Link href={routes.forgotPassword} className={buttonVariants({ size: "lg" })}>
          Request a new link
        </Link>
      </div>
    );
  }
  return <ResetPasswordForm />;
}
