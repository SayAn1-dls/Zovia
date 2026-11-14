import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { AuthCard, authLinkClass } from "@/features/auth/components/auth-card";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/sign-in" } };

export default function SignInPage() {
  return (
    <AuthCard
      title="Welcome back."
      description="Sign in to see your saved homes, matches and messages."
      footer={
        <>
          New to Zovia?{" "}
          <Link href={routes.signUp} className={authLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton count={2} />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
