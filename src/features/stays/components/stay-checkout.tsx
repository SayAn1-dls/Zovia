"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, CreditCard, Loader2, RotateCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";

import { EmptyState } from "@/components/feedback/empty-state";
import { useSession } from "@/components/session/session-context";
import { FormField, FormMessage, applyApiFieldErrors } from "@/components/form/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isApiError } from "@/lib/api/client";
import { formatDateTime } from "@/lib/format";
import { dynamicRoutes } from "@/lib/navigation";

import { STAY_RULES, createStayBookingSchema, normalisePhone, type StayPayment, type StayRequest } from "../schemas";
import { openRazorpayCheckout } from "../hooks/razorpay-checkout";
import { listingHref, useStaySelection } from "../hooks/stay-url-state";
import { useCreateStayBooking, useStayQuote, verifyStayPayment } from "../hooks/use-stays";
import { DatesNotice } from "./dates-notice";
import { PolicyTimeline } from "./policy-timeline";
import { shortfallText } from "./stay-booking-panel";
import { StaySummary, StaySummarySkeleton } from "./stay-summary";

/** The checkout form: everything in the booking body except the stay, which comes from the URL. */
export const checkoutFormSchema = createStayBookingSchema.omit({ stay: true });
type CheckoutFormValues = z.input<typeof checkoutFormSchema>;
type CheckoutFormOutput = z.output<typeof checkoutFormSchema>;

const FIELDS = ["guest.name", "guest.phone", "guest.email", "special_requests", "accept_policy"] as const;

type Unpaid = { bookingId: string; payment: Extract<StayPayment, { mode: "online" }>; holdUntil: string | null; message: string };

/**
 * /book/[slug]: guest details, policy, summary, and one button. Online payment opens Razorpay
 * Checkout with the server's order and the server verifies it; pay-at-property just confirms.
 */
export function StayCheckout({
  listing,
  defaults,
  expectedMode,
}: {
  listing: { slug: string; title: string; place: string };
  defaults: { name: string; email: string };
  /** What the server is set up for; the booking response has the final word. */
  expectedMode: StayPayment["mode"];
}) {
  const router = useRouter();
  const { selection, datesNotice, dismissDatesNotice } = useStaySelection();
  const request: StayRequest | null =
    selection.rooms.length > 0 ? { listing: listing.slug, checkin: selection.checkin, checkout: selection.checkout, rooms: selection.rooms } : null;
  const quote = useStayQuote(request);
  const create = useCreateStayBooking();
  const [mode, setMode] = useState(expectedMode);
  const [failure, setFailure] = useState<string | null>(null);
  const [unpaid, setUnpaid] = useState<Unpaid | null>(null);
  const [working, setWorking] = useState(false);

  const form = useForm<CheckoutFormValues, unknown, CheckoutFormOutput>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: { guest: { name: defaults.name, phone: "", email: defaults.email }, special_requests: "", accept_policy: false as unknown as true },
    mode: "onTouched",
  });

  // Prefill the name from the account once the browser session is known (never overwrite typing).
  const session = useSession();
  const accountName = session.status === "signed_in" ? session.user.display_name : null;
  useEffect(() => {
    if (accountName && !form.getValues("guest.name")) form.setValue("guest.name", accountName);
  }, [accountName, form]);

  const back = listingHref(listing.slug, selection);
  const fresh = quote.data !== undefined && !quote.isPlaceholderData;
  const available = fresh && quote.data!.available;

  async function pay(target: Unpaid, prefill: { name: string; email: string; contact: string }) {
    const outcome = await openRazorpayCheckout(target.payment, prefill);
    if (outcome.kind === "paid") {
      try {
        await verifyStayPayment(target.bookingId, outcome.proof);
        router.push(dynamicRoutes.booking(target.bookingId));
        return;
      } catch (error) {
        setUnpaid({ ...target, message: isApiError(error) ? error.message : "We could not confirm the payment yet. Open the booking in a minute." });
      }
    } else if (outcome.kind === "unavailable") {
      setUnpaid({ ...target, message: "The payment window could not load. Check your connection and try again." });
    } else if (outcome.kind === "failed") {
      setUnpaid({ ...target, message: "The payment did not go through. You were not charged." });
    } else {
      setUnpaid({ ...target, message: "Payment not finished." });
    }
    setWorking(false);
  }

  async function onSubmit(values: CheckoutFormOutput) {
    if (!request || !available) return;
    setFailure(null);
    setWorking(true);
    try {
      const result = await create.mutateAsync({ ...values, stay: request, expected_total_inr: quote.data?.grand_total_inr });
      setMode(result.payment.mode);
      if (result.payment.mode === "at_property") {
        router.push(dynamicRoutes.booking(result.booking.id));
        return;
      }
      await pay(
        { bookingId: result.booking.id, payment: result.payment, holdUntil: result.booking.hold_expires_at, message: "" },
        { name: values.guest.name, email: values.guest.email, contact: values.guest.phone },
      );
    } catch (error) {
      setWorking(false);
      if (isApiError(error)) {
        applyApiFieldErrors(form.setError, error.details, FIELDS);
        if (error.code === "conflict") void quote.refetch();
        setFailure(error.message);
      } else setFailure("Something went wrong. Please try again.");
    }
  }

  if (!request) {
    return (
      <EmptyState
        title="Choose your beds first"
        description="Pick dates and at least one bed on the listing, then tap Book now."
        action={
          <Link href={back} className={buttonVariants({ size: "lg" })}>
            Back to {listing.title}
          </Link>
        }
      />
    );
  }

  const busy = working || form.formState.isSubmitting;
  const online = mode === "online";

  return (
    <div className="space-y-6">
    <DatesNotice text={datesNotice} onDismiss={dismissDatesNotice} />
    {/*
      Tablets get the form and the summary side by side. The summary column holds nothing else,
      so its sticky card can only travel beside the form, never over other content; and it is
      sticky only on screens tall enough to show it whole.
    */}
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_19rem] lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12">
      <aside className="min-w-0 space-y-3 md:order-2 md:top-24 md:self-start md:[@media(min-height:44rem)]:sticky" aria-label="Your stay">
        {quote.isPending ? (
          <StaySummarySkeleton />
        ) : quote.isError && !quote.data ? (
          <FormMessage tone="danger" title="We could not get the price">
            <p>{isApiError(quote.error) ? quote.error.message : "Check your connection and try again."}</p>
            <Button type="button" variant="outline" size="lg" className="mt-2" onClick={() => void quote.refetch()}>
              <RotateCw data-icon="inline-start" aria-hidden />
              Try again
            </Button>
          </FormMessage>
        ) : (
          <StaySummary
            data={quote.data ?? null}
            dates={selection}
            pending={!fresh}
            title={listing.title}
            notice={
              fresh && !quote.data!.available ? (
                <FormMessage tone="warning" title="This stay is no longer available">
                  <p>{shortfallText(quote.data!)}</p>
                  <Link href={back} className="mt-1 inline-block font-semibold underline underline-offset-4">
                    Change dates or rooms
                  </Link>
                </FormMessage>
              ) : (
                <p className="text-sm text-muted-foreground">{listing.place}</p>
              )
            }
          />
        )}
        <Link href={back} className={buttonVariants({ variant: "ghost", size: "lg", className: "w-full text-muted-foreground" })}>
          <ArrowLeft data-icon="inline-start" aria-hidden />
          Change dates or rooms
        </Link>
      </aside>

      <div className="min-w-0 md:order-1">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6 rounded-3xl bg-card p-6 ring-1 ring-border sm:p-8">
          <div>
            <h2 className="text-xl font-bold">Guest details</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Who&apos;s checking in. We share these only with the property.</p>
          </div>
          {failure ? <FormMessage tone="danger">{failure}</FormMessage> : null}
          <FormField control={form.control} name="guest.name" label="Full name" description="As on your photo ID.">
            {(field) => <Input autoComplete="name" className="h-12" {...field} />}
          </FormField>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <FormField control={form.control} name="guest.phone" label="Mobile number">
              {(field) => (
                <Input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="9876543210" maxLength={20} className="h-12" {...field} />
              )}
            </FormField>
            <FormField control={form.control} name="guest.email" label="E-mail">
              {(field) => <Input type="email" inputMode="email" autoComplete="email" className="h-12" {...field} />}
            </FormField>
          </div>
          <FormField control={form.control} name="special_requests" label="Special requests" optional description="Arrival time, a lower bunk, anything the property should know.">
            {(field) => <Textarea rows={3} maxLength={500} {...field} value={field.value ?? ""} />}
          </FormField>

          <PolicyTimeline checkin={selection.checkin} checkout={selection.checkout} flat className="border-t border-border pt-6" />

          <Controller
            control={form.control}
            name="accept_policy"
            render={({ field, fieldState }) => (
              <div className="space-y-1.5">
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl py-2 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={field.value === true}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                    onBlur={field.onBlur}
                    aria-invalid={Boolean(fieldState.error)}
                    aria-describedby={fieldState.error ? "accept-policy-error" : undefined}
                  />
                  <span>I accept the cancellation policy and the house rules, and I am 18 or older.</span>
                </label>
                {fieldState.error ? (
                  <p id="accept-policy-error" role="alert" className="text-sm font-medium text-danger-foreground">
                    {fieldState.error.message}
                  </p>
                ) : null}
              </div>
            )}
          />

          {online ? null : (
            <FormMessage tone="info" title="Pay at the property. Nothing is charged now.">
              You pay the total when you check in.
            </FormMessage>
          )}

          {unpaid ? (
            <FormMessage tone="warning" title={unpaid.message}>
              {unpaid.holdUntil ? `Your beds are held until ${formatDateTime(unpaid.holdUntil)}. ` : null}
              Pay to confirm, or{" "}
              <Link href={dynamicRoutes.booking(unpaid.bookingId)} className="font-semibold underline underline-offset-4">
                open the booking
              </Link>
              .
            </FormMessage>
          ) : null}

          {unpaid ? (
            <Button
              type="button"
              size="xl"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setWorking(true);
                const values = form.getValues();
                void pay(unpaid, { name: values.guest.name, email: values.guest.email, contact: normalisePhone(values.guest.phone) });
              }}
            >
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <CreditCard data-icon="inline-start" aria-hidden />}
              Pay now
            </Button>
          ) : (
            <Button type="submit" size="xl" className="w-full" disabled={busy || !available}>
              {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : online ? <CreditCard data-icon="inline-start" aria-hidden /> : <ShieldCheck data-icon="inline-start" aria-hidden />}
              {online ? "Confirm and pay" : "Confirm booking"}
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">
            {online
              ? `You pay the full amount now through Razorpay. Your beds are held for ${STAY_RULES.hold_minutes} minutes while you pay.`
              : "Zovia confirms the details with the property and keeps you posted."}
          </p>
        </form>
      </div>
    </div>
    </div>
  );
}
