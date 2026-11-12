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
import { dynamicRoutes, withQuery } from "@/lib/navigation";

import { createPropertyAction, updateBasicsAction } from "../actions";
import {
  FURNISHING_LABELS,
  FURNISHINGS,
  LISTING_MODE_LABELS,
  LISTING_MODES,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  TENANT_GENDER_LABELS,
  TENANT_GENDERS,
  basicsSchema,
  type BasicsFormValues,
  type BasicsInput,
  type OwnerPropertyDetail,
} from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["title", "property_type", "listing_mode", "tenant_gender", "furnishing", "description"] as const;

function toValues(property: OwnerPropertyDetail | null): BasicsFormValues {
  return {
    title: property?.title ?? "",
    property_type: property?.property_type ?? "pg",
    listing_mode: property?.listing_mode ?? "per_bed",
    tenant_gender: property?.tenant_gender ?? "any",
    furnishing: property?.furnishing ?? "",
    description: property?.description ?? "",
  };
}

/** Step 1 of a new listing (creates the draft) and the "Basics" tab of an existing one. */
export function BasicsForm({ property }: { property: OwnerPropertyDetail | null }) {
  const router = useRouter();
  const form = useForm<BasicsFormValues, unknown, BasicsInput>({
    resolver: zodResolver(basicsSchema),
    defaultValues: toValues(property),
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting, isDirty } = form.formState;
  const hasRooms = (property?.rooms.length ?? 0) > 0;

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    const result = property ? await updateBasicsAction({ ...values, property_id: property.id }) : await createPropertyAction(values);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    if (!property && result.data) {
      toast.success("Draft created. Next: the address.");
      router.push(withQuery(dynamicRoutes.ownerProperty(result.data.id), { tab: "location" }));
      return;
    }
    form.reset(values);
    toast.success("Basics saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
      <FormField control={form.control} name="title" label="Listing title" description="Short and specific, e.g. “Sunny girls PG near Christ University”.">
        {(field) => <Input maxLength={120} {...field} />}
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="property_type" label="Property type">
          {(field) => (
            <NativeSelect {...field}>
              {PROPERTY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {PROPERTY_TYPE_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          control={form.control}
          name="listing_mode"
          label="How you let it"
          description={hasRooms ? "Remove the rooms first to switch to an entire unit." : undefined}
        >
          {(field) => (
            <NativeSelect {...field} disabled={hasRooms && field.value === "per_bed"}>
              {LISTING_MODES.map((value) => (
                <option key={value} value={value}>
                  {LISTING_MODE_LABELS[value].title} — {LISTING_MODE_LABELS[value].description}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="tenant_gender" label="Who can stay">
          {(field) => (
            <NativeSelect {...field}>
              {TENANT_GENDERS.map((value) => (
                <option key={value} value={value}>
                  {TENANT_GENDER_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="furnishing" label="Furnishing" optional>
          {(field) => (
            <NativeSelect {...field}>
              <option value="">Not specified</option>
              {FURNISHINGS.map((value) => (
                <option key={value} value={value}>
                  {FURNISHING_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField
        control={form.control}
        name="description"
        label="Description"
        optional={!property}
        description="What makes it a good place to live. At least 30 characters before you submit for review."
      >
        {(field) => <Textarea rows={6} maxLength={4000} {...field} />}
      </FormField>
      <Button type="submit" size="lg" disabled={isSubmitting || (property !== null && !isDirty)}>
        {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : property ? <Save data-icon="inline-start" aria-hidden /> : null}
        {property ? "Save basics" : "Create draft"}
        {!property && !isSubmitting ? <ArrowRight data-icon="inline-end" aria-hidden /> : null}
      </Button>
    </form>
  );
}
