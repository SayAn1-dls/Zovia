"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, MailCheck, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

import { emailOnlySchema, type EmailOnlyInput } from "../schemas";
import { toFailure, type Failure } from "./form-failure";

/** "Check your inbox" plus a resend form (rate limited on the server and by Supabase Auth). */
export function VerifyEmailPanel() {
  const searchParams = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";
  const justSent = searchParams.get("sent") === "1";
  const next = searchParams.get("next") ?? undefined;
  const form = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: initialEmail, next },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [resent, setResent] = useState(false);
  const { isSubmitting } = form.formState;

  async function onSubmit(values: EmailOnlyInput) {
    setFailure(null);
    setResent(false);
    try {
      await apiFetch("/auth/resend-verification", { method: "POST", body: values });
      setResent(true);
    } catch (error) {
      setFailure(toFailure(error, form.setError, ["email"]));
    }
  }

  return (
    <div className="space-y-6">
      {justSent ? (
        <div className="flex gap-3 rounded-2xl border border-border bg-muted/60 p-5">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden />
          <p className="text-[0.9375rem]">
            We sent a link to <span className="font-semibold break-all">{initialEmail || "your inbox"}</span>. Open it
            on this device to activate your account. It can take a minute; check spam too.
          </p>
        </div>
      ) : null}

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
        {resent ? (
          <FormMessage tone="success">If that address is waiting for verification, a new link is on its way.</FormMessage>
        ) : null}
        {failure ? (
          <FormMessage tone="danger" title={failure.title}>
            {failure.detail}
          </FormMessage>
        ) : null}
        <FormField control={form.control} name="email" label="E-mail">
          {(field) => <Input type="email" inputMode="email" autoComplete="email" {...field} />}
        </FormField>
        <Button type="submit" variant="outline" size="lg" disabled={isSubmitting} className="w-full sm:w-auto">
          {isSubmitting ? (
            <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
          ) : (
            <Send data-icon="inline-start" aria-hidden />
          )}
          {justSent ? "Send the link again" : "Send verification link"}
        </Button>
      </form>
    </div>
  );
}
