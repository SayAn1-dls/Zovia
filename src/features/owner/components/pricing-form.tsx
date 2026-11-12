"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/format";

import { updatePricingAction } from "../actions";
import { buildPricingPreview, toAmount, type PricingPreview } from "../pricing-preview";
import {
  UTILITY_BILLING_LABELS,
  UTILITY_BILLINGS,
  pricingSchema,
  type OwnerPropertyDetail,
  type PricingFormValues,
  type PricingInput,
} from "../schemas";
import { CheckRow, Panel } from "./bits";
import { NativeSelect } from "./native-select";

const FIELDS = [
  "monthly_rent",
  "security_deposit",
  "maintenance_monthly",
  "electricity_billing",
  "electricity_monthly_estimate",
  "water_billing",
  "water_monthly_estimate",
  "food_monthly_charge",
] as const;

const money = (value: number | null) => (value === null ? "" : String(value));

/** Itemised estimate from lib/pricing.ts, updated as the owner types. */
export function CostPreview({ preview }: { preview: PricingPreview }) {
  if (preview.kind === "needs") {
    return <p className="text-sm text-muted-foreground">{preview.message}</p>;
  }
  const { estimate } = preview;
  return (
    <div className="space-y-4" data-testid="cost-preview">
      <p className="text-sm text-muted-foreground">{preview.basis}</p>
      <ul className="space-y-1.5 text-sm">
        {estimate.items.map((item, index) => (
          <li key={`${item.kind}-${index}`} className="flex justify-between gap-3">
            <span className="min-w-0 text-foreground">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {item.amount === null ? "not set" : item.included ? "included" : formatINR(item.amount)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
        <span className="font-semibold">Estimated monthly{estimate.incomplete ? " (at least)" : ""}</span>
        <span className="font-heading text-xl font-bold tabular-nums" data-testid="monthly-total">
          {formatINR(estimate.monthly_total)}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Move-in cost{estimate.move_in_incomplete ? " (at least)" : ""}</span>
        <span className="tabular-nums">{formatINR(estimate.move_in_total)}</span>
      </div>
      {estimate.notes.length ? (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {estimate.notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PricingForm({ property }: { property: OwnerPropertyDetail }) {
  const router = useRouter();
  const form = useForm<PricingFormValues, unknown, PricingInput>({
    resolver: zodResolver(pricingSchema),
    defaultValues: {
      property_id: property.id,
      monthly_rent: money(property.monthly_rent),
      security_deposit: money(property.security_deposit),
      maintenance_monthly: money(property.maintenance_monthly),
      electricity_billing: property.electricity_billing ?? "metered",
      electricity_monthly_estimate: money(property.electricity_monthly_estimate),
      water_billing: property.water_billing ?? "included",
      water_monthly_estimate: money(property.water_monthly_estimate),
      food_available: property.food_available,
      food_included: property.food_included,
      food_monthly_charge: money(property.food_monthly_charge),
      meals_breakfast: property.meals_breakfast,
      meals_lunch: property.meals_lunch,
      meals_dinner: property.meals_dinner,
    },
    mode: "onTouched",
  });
  const [failure, setFailure] = useState<string | null>(null);
  const { isSubmitting, isDirty } = form.formState;
  const values = useWatch({ control: form.control });
  const entireUnit = property.listing_mode === "entire_unit";

  const preview = buildPricingPreview({
    listing_mode: property.listing_mode,
    pricing: {
      monthly_rent: toAmount(values.monthly_rent),
      security_deposit: toAmount(values.security_deposit),
      maintenance_monthly: toAmount(values.maintenance_monthly),
      electricity_billing: values.electricity_billing ?? null,
      electricity_monthly_estimate: toAmount(values.electricity_monthly_estimate),
      water_billing: values.water_billing ?? null,
      water_monthly_estimate: toAmount(values.water_monthly_estimate),
      food_available: values.food_available ?? false,
      food_included: values.food_included ?? false,
      food_monthly_charge: toAmount(values.food_monthly_charge),
    },
    rooms: property.rooms.map((room) => ({ name: room.name, rent_per_bed: room.rent_per_bed, security_deposit: room.security_deposit })),
    charges: property.charges,
  });

  async function onSubmit() {
    setFailure(null);
    const raw = form.getValues();
    const result = await updatePricingAction(raw);
    if (!result.ok) {
      applyApiFieldErrors(form.setError, result.error.details, FIELDS);
      setFailure(result.error.message);
      return;
    }
    form.reset(raw);
    toast.success("Pricing saved");
    router.refresh();
  }

  const moneyInput = (name: (typeof FIELDS)[number], label: string, description?: string, optional = true) => (
    <FormField control={form.control} name={name} label={label} optional={optional} description={description}>
      {(field) => <Input inputMode="numeric" placeholder="₹" {...field} value={String(field.value ?? "")} />}
    </FormField>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
        {failure ? <FormMessage tone="danger" title="Not saved">{failure}</FormMessage> : null}
        <div className="grid gap-5 sm:grid-cols-2">
          {entireUnit ? (
            <>
              {moneyInput("monthly_rent", "Monthly rent", "For the whole unit, in rupees.", false)}
              {moneyInput("security_deposit", "Security deposit")}
            </>
          ) : (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Rent and deposit are set per room in <span className="font-semibold text-foreground">Rooms &amp; beds</span>.
            </p>
          )}
          {moneyInput("maintenance_monthly", "Maintenance per month")}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="electricity_billing" label="Electricity">
            {(field) => (
              <NativeSelect {...field}>
                {UTILITY_BILLINGS.map((value) => (
                  <option key={value} value={value}>
                    {UTILITY_BILLING_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {values.electricity_billing !== "included"
            ? moneyInput("electricity_monthly_estimate", values.electricity_billing === "fixed" ? "Electricity per month" : "Typical electricity bill", values.electricity_billing === "metered" ? "Your honest estimate per month." : undefined)
            : <div className="hidden sm:block" />}
          <FormField control={form.control} name="water_billing" label="Water">
            {(field) => (
              <NativeSelect {...field}>
                {UTILITY_BILLINGS.map((value) => (
                  <option key={value} value={value}>
                    {UTILITY_BILLING_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {values.water_billing !== "included"
            ? moneyInput("water_monthly_estimate", values.water_billing === "fixed" ? "Water per month" : "Typical water bill")
            : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-foreground">Food</legend>
          <Controller
            control={form.control}
            name="food_available"
            render={({ field }) => <CheckRow label="Meals are available" checked={Boolean(field.value)} onChange={field.onChange} />}
          />
          {values.food_available ? (
            <div className="space-y-2 pl-1">
              <Controller
                control={form.control}
                name="food_included"
                render={({ field }) => <CheckRow label="Included in the rent" checked={Boolean(field.value)} onChange={field.onChange} />}
              />
              {!values.food_included ? moneyInput("food_monthly_charge", "Food charge per month") : null}
              <div className="flex flex-wrap gap-x-6">
                {(["meals_breakfast", "meals_lunch", "meals_dinner"] as const).map((name) => (
                  <Controller
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <CheckRow label={name === "meals_breakfast" ? "Breakfast" : name === "meals_lunch" ? "Lunch" : "Dinner"} checked={Boolean(field.value)} onChange={field.onChange} />
                    )}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </fieldset>

        <Button type="submit" size="lg" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          Save pricing
        </Button>
      </form>
      <Panel title="What a tenant pays" className="h-fit lg:sticky lg:top-24">
        <CostPreview preview={preview} />
        <p className="mt-4 text-xs text-muted-foreground">Extra charges from “Rules &amp; charges” are included. Save to update the live listing.</p>
      </Panel>
    </div>
  );
}
