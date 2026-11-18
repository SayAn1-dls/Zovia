import type { Metadata } from "next";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthSwitchLink } from "@/features/auth/components/auth-switch-link";
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
          <AuthSwitchLink href={routes.signUp}>Create an account</AuthSwitchLink>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton count={2} />}>
        <SignInForm />
      </Suspense>
    </AuthCard>
  );
}
