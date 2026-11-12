import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { AuthCard, authLinkClass } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Reset your password", alternates: { canonical: "/forgot-password" } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your e-mail and we will send you a link to choose a new one."
      footer={
        <>
          Remembered it?{" "}
          <Link href={routes.signIn} className={authLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton count={1} />}>
        <ForgotPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
