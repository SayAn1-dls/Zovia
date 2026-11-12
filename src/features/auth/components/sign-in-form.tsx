"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { routes } from "@/lib/navigation";

import { AUTH_LINK_ERRORS, signInSchema, type AuthLinkError, type SignInInput, type SignInResult } from "../schemas";
import { authLinkClass } from "./auth-card";
import { toFailure, type Failure } from "./form-failure";

const FIELDS = ["email", "password"] as const;

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? undefined;
  const linkError = searchParams.get("error") as AuthLinkError | null;
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const busy = form.formState.isSubmitting || redirecting;

  async function onSubmit(values: SignInInput) {
    setFailure(null);
    try {
      const result = await apiFetch<SignInResult>("/auth/sign-in", { method: "POST", body: { ...values, next } });
      // A full navigation, so every part of the page (and the session adapter) starts signed in.
      setRedirecting(true);
      window.location.assign(result.redirect_to);
    } catch (error) {
      setFailure(toFailure(error, form.setError, FIELDS));
    }
  }

  const email = useWatch({ control: form.control, name: "email" });
  const verifyHref = `${routes.verifyEmail}?email=${encodeURIComponent(email)}`;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? (
        <FormMessage tone="danger" title={failure.title}>
          <p>{failure.detail}</p>
          {failure.reason === "email_not_confirmed" ? (
            <p className="mt-1">
              <Link href={verifyHref as typeof routes.verifyEmail} className="font-semibold underline underline-offset-4">
                Send the verification link again
              </Link>
            </p>
          ) : null}
          {failure.reference ? <p className="mt-1 font-mono text-xs">Reference: {failure.reference}</p> : null}
        </FormMessage>
      ) : linkError && linkError in AUTH_LINK_ERRORS ? (
        <FormMessage tone="warning">{AUTH_LINK_ERRORS[linkError]}</FormMessage>
      ) : null}

      <FormField control={form.control} name="email" label="E-mail">
        {(field) => <Input type="email" inputMode="email" autoComplete="email" {...field} />}
      </FormField>
      <FormField control={form.control} name="password" label="Password">
        {(field) => <Input type="password" autoComplete="current-password" {...field} />}
      </FormField>

      <div className="flex justify-end">
        <Link href={routes.forgotPassword} className={`text-sm ${authLinkClass}`}>
          Forgot password?
        </Link>
      </div>

      <Button type="submit" size="xl" disabled={busy} className="w-full">
        {busy ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <LogIn data-icon="inline-start" aria-hidden />
        )}
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
