"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralize } from "@/lib/format";

import { updateAvailabilityAction } from "../actions";
import {
  AVAILABILITY_STATUS_LABELS,
  AVAILABILITY_STATUSES,
  availabilitySchema,
  type AvailabilityFormValues,
  type AvailabilityInput,
  type OwnerPropertyDetail,
} from "../schemas";
import { NativeSelect } from "./native-select";

const FIELDS = ["status", "available_from", "min_stay_months", "notice_period_days"] as const;
const text = (value: number | string | null | undefined) => (value === null || value === undefined ? "" : String(value));

/**
 * The property's own availability statement. Entire units: the owner sets it here.
 * Per-bed listings: derived from the beds by trigger, so the derived status is shown read-only
 * next to the bed counts (the two are never conflated).
 */
export function AvailabilityForm({ property }: { property: OwnerPropertyDetail }) {
  const router = useRouter();
  const availability = property.availability;
  const form = useForm<AvailabilityFormValues, unknown, AvailabilityInput>({
    resolver: zodResolver(availabilitySchema),
    defaultValues: {
      property_id: property.id,
      status: availability?.status ?? "available",
      available_from: availability?.available_from ?? "",
      min_stay_months: text(availability?.min_stay_months),
      notice_period_days: text(availability?.notice_period_days),
    },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting, isDirty } = form.formState;

  if (property.listing_mode === "per_bed") {
    return (
      <div className="space-y-2 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          Listing availability: <StatusBadge status={availability?.status ?? "unavailable"} />
        </p>
        <p className="text-muted-foreground">
          {property.available_beds} of {pluralize(property.total_beds, "bed")} available. This is worked out from your bed statuses in
          Rooms &amp; beds.
        </p>
      </div>
    );
  }

  async function onSubmit() {
    setFailure(null);
    const values = form.getValues();
    const result = await updateAvailabilityAction(values);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    form.reset(values);
    toast.success("Availability saved");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
      {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField control={form.control} name="status" label="Availability">
          {(field) => (
            <NativeSelect {...field}>
              {AVAILABILITY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {AVAILABILITY_STATUS_LABELS[value]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField control={form.control} name="available_from" label="Available from" optional>
          {(field) => <Input type="date" {...field} value={String(field.value ?? "")} />}
        </FormField>
        <FormField control={form.control} name="min_stay_months" label="Minimum stay (months)" optional>
          {(field) => <Input inputMode="numeric" {...field} value={String(field.value ?? "")} />}
        </FormField>
        <FormField control={form.control} name="notice_period_days" label="Notice period (days)" optional>
          {(field) => <Input inputMode="numeric" {...field} value={String(field.value ?? "")} />}
        </FormField>
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
        Save availability
      </Button>
    </form>
  );
}
