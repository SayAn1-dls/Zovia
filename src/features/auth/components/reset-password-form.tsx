"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { FormField, FormMessage } from "@/components/form/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { routes } from "@/lib/navigation";

import { resetPasswordSchema, type ResetPasswordInput } from "../schemas";
import { toFailure, type Failure } from "./form-failure";

/** Sets a new password for the current session (recovery link or settings). */
export function ResetPasswordForm({ doneHref = routes.search }: { doneHref?: typeof routes.search }) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm_password: "" },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<Failure | null>(null);
  const [done, setDone] = useState(false);
  const { isSubmitting } = form.formState;

  async function onSubmit(values: ResetPasswordInput) {
    setFailure(null);
    try {
      await apiFetch("/auth/reset-password", { method: "POST", body: values });
      setDone(true);
      form.reset();
    } catch (error) {
      setFailure(toFailure(error, form.setError, ["password", "confirm_password"]));
    }
  }

  if (done) {
    return (
      <div className="space-y-5">
        <FormMessage tone="success" title="Password updated">
          Use your new password next time you sign in.
        </FormMessage>
        <Link href={doneHref} className={buttonVariants({ size: "lg" })}>
          Continue
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? (
        <FormMessage tone="danger" title={failure.title}>
          <p>{failure.detail}</p>
          {failure.code === "unauthenticated" ? (
            <p className="mt-1">
              <Link href={routes.forgotPassword} className="font-semibold underline underline-offset-4">
                Request a new reset link
              </Link>
            </p>
          ) : null}
        </FormMessage>
      ) : null}
      <FormField
        control={form.control}
        name="password"
        label="New password"
        description="At least 8 characters, with letters and numbers."
      >
        {(field) => <Input type="password" autoComplete="new-password" {...field} />}
      </FormField>
      <FormField control={form.control} name="confirm_password" label="Confirm new password">
        {(field) => <Input type="password" autoComplete="new-password" {...field} />}
      </FormField>
      <Button type="submit" size="xl" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <KeyRound data-icon="inline-start" aria-hidden />
        )}
        Save new password
      </Button>
    </form>
  );
}
