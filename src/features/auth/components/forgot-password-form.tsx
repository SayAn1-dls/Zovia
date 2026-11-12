"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";

import { AUTH_LINK_ERRORS, emailOnlySchema, type EmailOnlyInput } from "../schemas";
import { toFailure, type Failure } from "./form-failure";

export function ForgotPasswordForm() {
  const linkInvalid = useSearchParams().get("error") === "link_invalid";
  const form = useForm<EmailOnlyInput>({
    resolver: zodResolver(emailOnlySchema),
    defaultValues: { email: "" },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sent, setSent] = useState(false);
  const { isSubmitting } = form.formState;

  async function onSubmit(values: EmailOnlyInput) {
    setFailure(null);
    try {
      await apiFetch("/auth/forgot-password", { method: "POST", body: { email: values.email } });
      setSent(true);
    } catch (error) {
      setFailure(toFailure(error, form.setError, ["email"]));
    }
  }

  if (sent) {
    return (
      <FormMessage tone="success" title="Check your inbox">
        If an account uses that address, a reset link is on its way. Open it on this device.
      </FormMessage>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? (
        <FormMessage tone="danger" title={failure.title}>
          {failure.detail}
        </FormMessage>
      ) : linkInvalid ? (
        <FormMessage tone="warning">{AUTH_LINK_ERRORS.link_invalid}</FormMessage>
      ) : null}
      <FormField control={form.control} name="email" label="E-mail">
        {(field) => <Input type="email" inputMode="email" autoComplete="email" {...field} />}
      </FormField>
      <Button type="submit" size="xl" disabled={isSubmitting} className="w-full">
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <Send data-icon="inline-start" aria-hidden />
        )}
        Send reset link
      </Button>
    </form>
  );
}
