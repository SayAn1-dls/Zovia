"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshSession } from "@/features/auth/session-adapter";
import { routes } from "@/lib/navigation";

import { becomeOwnerAction, updateOwnerProfileAction } from "../actions";
import {
  OWNER_TYPE_LABELS,
  OWNER_TYPES,
  ownerProfileSchema,
  type OwnerAccount,
  type OwnerProfileFormValues,
  type OwnerProfileInput,
} from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["owner_type", "business_name", "contact_phone", "whatsapp_number", "contact_email", "about"] as const;

function toValues(account: OwnerAccount | null): OwnerProfileFormValues {
  return {
    owner_type: account?.owner_type ?? "individual",
    business_name: account?.business_name ?? "",
    contact_phone: account?.contact_phone ?? "",
    whatsapp_number: account?.whatsapp_number ?? "",
    contact_email: account?.contact_email ?? "",
    about: account?.about ?? "",
  };
}

/**
 * Becoming an owner (`mode="onboarding"`: calls become_owner, refreshes the session so the
 * owner role shows up, then opens the portal) or editing the owner profile (`mode="profile"`).
 */
export function OwnerAccountForm({ mode, account }: { mode: "onboarding" | "profile"; account: OwnerAccount | null }) {
  const router = useRouter();
  const form = useForm<OwnerProfileFormValues, unknown, OwnerProfileInput>({
    resolver: zodResolver(ownerProfileSchema),
    defaultValues: toValues(account),
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting, isDirty } = form.formState;

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    const result =
      mode === "onboarding"
        ? await becomeOwnerAction({
            owner_type: values.owner_type,
            business_name: values.business_name,
            contact_phone: values.contact_phone,
            whatsapp_number: values.whatsapp_number,
            contact_email: values.contact_email,
          })
        : await updateOwnerProfileAction(values);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    if (mode === "onboarding") {
      await refreshSession();
      toast.success("You are now an owner on Zovia");
      router.replace(routes.owner);
      router.refresh();
      return;
    }
    form.reset(values);
    toast.success("Owner profile saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? (
        <FormMessage tone="danger" title={mode === "onboarding" ? "Could not register you as an owner" : "Not saved"}>
          {failure}
        </FormMessage>
      ) : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="owner_type" label="You are">
          {(field) => (
            <NativeSelect {...field}>
              {OWNER_TYPES.map((value) => (
                <option key={value} value={value}>
                  {OWNER_TYPE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="business_name" label="Business name" optional description="Shown on your listings instead of your name.">
          {(field) => <Input autoComplete="organization" {...field} />}
        </FormField>
        <FormField
          control={form.control}
          name="contact_phone"
          label="Contact phone"
          description="Shared only with people who enquire or ask to see it."
        >
          {(field) => <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="9876543210" {...field} />}
        </FormField>
        <FormField control={form.control} name="whatsapp_number" label="WhatsApp number" optional>
          {(field) => <Input type="tel" inputMode="tel" placeholder="9876543210" {...field} />}
        </FormField>
        <FormField control={form.control} name="contact_email" label="Contact e-mail" optional className="sm:col-span-2">
          {(field) => <Input type="email" autoComplete="email" {...field} />}
        </FormField>
      </div>
      {mode === "profile" ? (
        <FormField control={form.control} name="about" label="About you" optional description="A few lines for seekers. Up to 1,000 characters.">
          {(field) => <Textarea rows={4} maxLength={1000} {...field} />}
        </FormField>
      ) : null}
      <Button type="submit" size="lg" disabled={isSubmitting || (mode === "profile" && !isDirty)}>
        {isSubmitting ? (
          <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
        ) : mode === "profile" ? (
          <Save data-icon="inline-start" aria-hidden />
        ) : null}
        {mode === "onboarding" ? "Start listing" : "Save profile"}
        {mode === "onboarding" && !isSubmitting ? <ArrowRight data-icon="inline-end" aria-hidden /> : null}
      </Button>
    </form>
  );
}
