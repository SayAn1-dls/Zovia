"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { routes } from "@/lib/navigation";

import { signUpSchema, type SignUpInput, type SignUpResult } from "../schemas";
import { authLinkClass } from "./auth-card";
import { toFailure, type Failure } from "./form-failure";

const FIELDS = ["full_name", "email", "password"] as const;

export function SignUpForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? undefined;
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { full_name: "", email: "", password: "", next },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const isSubmitting = form.formState.isSubmitting || redirecting;

  async function onSubmit(values: SignUpInput) {
    setFailure(null);
    try {
      const result = await apiFetch<SignUpResult>("/auth/sign-up", { method: "POST", body: values });
      if (result.status === "signed_in") {
        setRedirecting(true);
        window.location.assign(result.redirect_to);
        return;
      }
      const query = new URLSearchParams({ email: values.email, sent: "1" });
      if (next) query.set("next", next);
      router.push(`${routes.verifyEmail}?${query.toString()}` as typeof routes.verifyEmail);
    } catch (error) {
      setFailure(toFailure(error, form.setError, FIELDS));
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? (
        <FormMessage tone="danger" title={failure.title}>
          <p>{failure.detail}</p>
          {failure.reference ? <p className="mt-1 font-mono text-xs">Reference: {failure.reference}</p> : null}
        </FormMessage>
      ) : null}

      <FormField control={form.control} name="full_name" label="Your name">
        {(field) => <Input autoComplete="name" {...field} />}
      </FormField>
      <FormField control={form.control} name="email" label="E-mail">
        {(field) => <Input type="email" inputMode="email" autoComplete="email" {...field} />}
      </FormField>
      <FormField
        control={form.control}
        name="password"
        label="Password"
        description="At least 8 characters, with letters and numbers."
      >
        {(field) => <Input type="password" autoComplete="new-password" {...field} />}
      </FormField>

      <Button type="submit" size="xl" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <UserPlus data-icon="inline-start" aria-hidden />
        )}
        {isSubmitting ? "Creating your account…" : "Create account"}
      </Button>

      <p className="text-xs text-muted-foreground">
        By creating an account you agree to the{" "}
        <Link href={routes.terms} className={authLinkClass}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href={routes.privacy} className={authLinkClass}>
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
