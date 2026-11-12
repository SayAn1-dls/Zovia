"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarCheck, Loader2 } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Money } from "@/components/money";
import { useSession } from "@/components/session/session-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/features/account/components/native-select";
import { apiFetch, isApiError } from "@/lib/api/client";
import { signInHref } from "@/lib/navigation";

import { indiaDate, requestBookingSchema, type RequestBookingFormValues, type RequestBookingInput } from "../schemas";

export type BookableBed = {
  id: string;
  label: string;
  room_name: string;
  rent: number;
  deposit: number | null;
  available_from: string | null;
};

type BookingCardProps = {
  propertyId: string;
  slug: string;
  listingMode: "per_bed" | "entire_unit";
  /** per_bed: beds whose status is available. */
  beds: BookableBed[];
  /** entire_unit */
  monthlyRent: number | null;
  securityDeposit: number | null;
  /** entire_unit: whether the owner says it is available. */
  unitAvailable: boolean;
};

/**
 * Airbnb-style booking card (spec 14.2). Sends a REQUEST; nothing is charged until the owner
 * accepts. The amount shown is the same rule the database applies (deposit if set, otherwise the
 * first month), and the database computes it again; this card never sends a price.
 */
export function BookingCard({ propertyId, slug, listingMode, beds, monthlyRent, securityDeposit, unitAvailable }: BookingCardProps) {
  const session = useSession();
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const form = useForm<RequestBookingFormValues, unknown, RequestBookingInput>({
    resolver: zodResolver(requestBookingSchema),
    defaultValues: {
      property_id: propertyId,
      bed_id: listingMode === "per_bed" ? beds[0]?.id : undefined,
      move_in_date: indiaDate(7),
      stay_months: 6,
      note: "",
    },
    mode: "onTouched",
  });
  const bedId = useWatch({ control: form.control, name: "bed_id" });
  const bed = beds.find((candidate) => candidate.id === bedId);
  const rent = listingMode === "per_bed" ? (bed?.rent ?? null) : monthlyRent;
  const deposit = listingMode === "per_bed" ? (bed?.deposit ?? null) : securityDeposit;
  const payNow = deposit && deposit > 0 ? deposit : rent;
  const bookable = listingMode === "per_bed" ? beds.length > 0 : unitAvailable && monthlyRent !== null;
  const busy = form.formState.isSubmitting || redirecting;

  async function onSubmit(values: RequestBookingInput) {
    setFailure(null);
    try {
      const { id } = await apiFetch<{ id: string }>("/bookings", { method: "POST", body: values });
      setRedirecting(true);
      router.push(`/bookings/${id}` as Route);
    } catch (error) {
      if (isApiError(error)) {
        applyApiFieldErrors(form.setError, error.details, ["move_in_date", "stay_months", "bed_id", "note"]);
        setFailure(error.message);
      } else setFailure("Something went wrong. Please try again.");
    }
  }

  return (
    <section aria-labelledby="booking-heading" className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="booking-heading" className="text-lg font-bold">
          Book
        </h2>
        {rent ? <Money amount={rent} suffix="/mo" className="text-lg font-bold" /> : null}
      </div>

      {!bookable ? (
        <p className="mt-3 text-sm text-muted-foreground">No beds or units are open for booking right now. Send an enquiry to ask the owner.</p>
      ) : session.status !== "signed_in" ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Sign in to request this {listingMode === "per_bed" ? "bed" : "home"}.</p>
          <Link href={signInHref(`/properties/${slug}`)} className={buttonVariants({ size: "lg", className: "w-full" })}>
            Sign in to book
          </Link>
        </div>
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-4 space-y-4">
          {failure ? <FormMessage tone="danger">{failure}</FormMessage> : null}
          {listingMode === "per_bed" ? (
            <FormField control={form.control} name="bed_id" label="Bed">
              {(field) => (
                <NativeSelect {...field} value={field.value ?? ""}>
                  {beds.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.room_name} · {candidate.label} · ₹{candidate.rent.toLocaleString("en-IN")}/mo
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="move_in_date" label="Move in">
              {(field) => <Input type="date" min={indiaDate(0)} max={indiaDate(180)} {...field} />}
            </FormField>
            <FormField control={form.control} name="stay_months" label="Months">
              {(field) => (
                <NativeSelect {...field} value={String(field.value ?? "")}>
                  {[1, 2, 3, 6, 9, 12, 18, 24].map((months) => (
                    <option key={months} value={months}>
                      {months}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </FormField>
          </div>
          <FormField control={form.control} name="note" label="Note to owner" optional>
            {(field) => <Textarea rows={2} maxLength={500} placeholder="A line about you" {...field} value={field.value ?? ""} />}
          </FormField>

          {payNow ? (
            <dl className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
              <div className="flex justify-between">
                <dt>{deposit && deposit > 0 ? "Security deposit" : "First month's rent"}</dt>
                <dd>
                  <Money amount={payNow} />
                </dd>
              </div>
              <p className="text-xs text-muted-foreground">Paid online only after the owner accepts. Nothing is charged now.</p>
            </dl>
          ) : null}

          <Button type="submit" size="xl" disabled={busy} className="w-full">
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <CalendarCheck data-icon="inline-start" aria-hidden />}
            Request to book
          </Button>
        </form>
      )}
    </section>
  );
}
