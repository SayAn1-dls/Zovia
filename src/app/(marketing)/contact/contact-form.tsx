"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheck, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

import { applyApiFieldErrors, FormField, FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendMessage } from "@/lib/send-message";

import {
  contactFormDefaults,
  contactFormSchema,
  type ContactFormValues,
  toContactPayload,
} from "./schema";

const FIELD_NAMES = ["name", "email", "phone", "subject", "message"] as const;

type Failure = { title: string; detail: string; reference?: string };

function failureFor(status: number, code: string | undefined, requestId: string | undefined): Failure {
  if (status === 429 || code === "rate_limited") {
    return {
      title: "Too many messages",
      detail: "You have sent several messages in a short time. Please wait a few minutes and try again.",
      reference: requestId,
    };
  }
  if (status === 422 || status === 400 || code === "validation_failed" || code === "bad_request") {
    return {
      title: "Please check the form",
      detail: "Some details were not accepted. Fix the highlighted fields and send again.",
      reference: requestId,
    };
  }
  return {
    title: "Your message was not sent",
    detail: "We couldn't deliver it just now. Your message is still here, so please try again in a moment.",
    reference: requestId,
  };
}

/**
 * Contact form: the visitor's name, e-mail, subject and message go to the developer's inbox with
 * the visitor's address as Reply-To (see `sendMessage`). Success is shown only when the message
 * was really delivered or stored; otherwise the typed message is kept and the reason shown.
 */
export function ContactForm() {
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: contactFormDefaults,
    mode: "onTouched",
  });
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const { isSubmitting } = form.formState;

  // Move focus to the result (success panel or error summary) so it is announced.
  useEffect(() => {
    if (sent || failure) statusRef.current?.focus();
  }, [sent, failure]);

  async function onSubmit(values: ContactFormValues) {
    setFailure(null);
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setFailure({ title: "You appear to be offline", detail: "Check your connection and send again." });
      return;
    }
    const result = await sendMessage(toContactPayload(values));
    if (result.ok) {
      setSent(true);
      form.reset(contactFormDefaults);
      return;
    }
    applyApiFieldErrors(form.setError, result.details, FIELD_NAMES);
    setFailure(failureFor(result.status, result.code, result.requestId));
  }

  if (sent) {
    return (
      <div
        ref={statusRef}
        tabIndex={-1}
        role="status"
        className="rounded-2xl border border-success-foreground/30 bg-success-surface p-6 outline-none sm:p-8"
      >
        <CircleCheck className="size-7 text-success-foreground" aria-hidden />
        <h2 className="mt-3 text-display-sm font-extrabold text-success-foreground">Message sent</h2>
        <p className="mt-2 max-w-sm text-[0.9375rem] text-success-foreground">
          Thanks for writing in. Your message is in the developer&apos;s inbox, and the reply will come to the
          e-mail address you entered.
        </p>
        <Button variant="outline" size="lg" className="mt-6" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      <div ref={statusRef} tabIndex={-1} className="outline-none">
        {failure ? (
          <FormMessage tone="danger" title={failure.title}>
            <p>{failure.detail}</p>
            {failure.reference ? (
              <p className="mt-1 font-mono text-xs">Reference: {failure.reference}</p>
            ) : null}
          </FormMessage>
        ) : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="name" label="Name">
          {(field) => <Input autoComplete="name" {...field} />}
        </FormField>
        <FormField control={form.control} name="email" label="E-mail">
          {(field) => <Input type="email" inputMode="email" autoComplete="email" {...field} />}
        </FormField>
      </div>

      <FormField control={form.control} name="phone" label="Phone" optional>
        {(field) => <Input type="tel" inputMode="tel" autoComplete="tel" {...field} />}
      </FormField>

      <FormField control={form.control} name="subject" label="Subject">
        {(field) => <Input {...field} />}
      </FormField>

      <FormField control={form.control} name="message" label="Message" description="Up to 2,000 characters.">
        {(field) => <Textarea rows={6} maxLength={2000} {...field} />}
      </FormField>

      {/* Honeypot: hidden from people and assistive tech; bots tend to fill it. */}
      <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
        </label>
      </div>

      <Button type="submit" size="xl" disabled={isSubmitting} className="w-full sm:w-auto">
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : (
          <Send data-icon="inline-start" aria-hidden />
        )}
        {isSubmitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
