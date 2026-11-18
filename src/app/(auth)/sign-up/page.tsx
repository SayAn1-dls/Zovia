import type { Metadata } from "next";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { AuthCard } from "@/features/auth/components/auth-card";
import { AuthSwitchLink } from "@/features/auth/components/auth-switch-link";
import { SignUpForm } from "@/features/auth/components/sign-up-form";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Create an account", alternates: { canonical: "/sign-up" } };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Join Zovia."
      description="Find your space. Find your people. It takes a minute."
      footer={
        <>
          Already have an account?{" "}
          <AuthSwitchLink href={routes.signIn}>Sign in</AuthSwitchLink>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton count={3} />}>
        <SignUpForm />
      </Suspense>
    </AuthCard>
  );
}
