"use client";

import { CalendarPlus, CreditCard, FileText, Info, Loader2, Share2, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { FormMessage } from "@/components/form/form-field";
import { Money } from "@/components/money";
import { Button, buttonVariants } from "@/components/ui/button";
import { WhatsAppIcon, whatsappShareHref } from "@/components/whatsapp/whatsapp-buttons";
import { isApiError } from "@/lib/api/client";
import { formatINR, formatDateTime } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";
import { absoluteUrl, site } from "@/lib/site";

import { STAY_RULES, type StayBooking } from "../schemas";
import { bookingSummaryText, buildStayIcs, formatClock, formatStayDate, indiaInstant, lineMath, lineTitle, nightsLabel } from "../hooks/stay-text";
import { listingHref } from "../hooks/stay-url-state";
import { openRazorpayCheckout } from "../hooks/razorpay-checkout";
import { fetchStayPayment, stayKeys, useCancelStay, useStayBooking, verifyStayPayment } from "../hooks/use-stays";
import { PolicyTimeline } from "./policy-timeline";
import { StayStatusBadge } from "./stay-status";

/** Can the guest still cancel? Until check-in, while the booking is live. */
export function canCancel(booking: Pick<StayBooking, "status" | "checkin">, now = Date.now()): boolean {
  if (booking.status !== "confirmed" && booking.status !== "pending_payment") return false;
  return now < Date.parse(indiaInstant(booking.checkin, STAY_RULES.check_in_time));
}

/** What cancelling now gives back, in one sentence for the confirm dialog. */
export function refundPreview(booking: StayBooking, now = Date.now()): string {
  if (!booking.paid || booking.payment_mode === "at_property") return "Nothing was charged, so there is nothing to refund. The beds are freed for others.";
  if (booking.free_cancel_until && now < Date.parse(booking.free_cancel_until)) {
    return `You get ${formatINR(booking.grand_total_inr)} back (100% of what you paid online).`;
  }
  return "Free cancellation has ended, so there is no refund.";
}

function refundLine(booking: StayBooking): string {
  switch (booking.refund_status) {
    case "refunded":
      return `${formatINR(booking.refund_inr)} was refunded to your payment method.`;
    case "pending":
      return `A refund of ${formatINR(booking.refund_inr)} is on its way. Banks take 5 to 7 working days.`;
    case "refund_due":
      return `A refund of ${formatINR(booking.refund_inr)} is due. The Zovia team will send it and confirm by e-mail.`;
    default:
      return booking.paid ? "Free cancellation had ended, so there was no refund." : "Nothing was charged.";
  }
}

function StatusMessage({ booking }: { booking: StayBooking }) {
  switch (booking.status) {
    case "pending_payment":
      return (
        <FormMessage tone="warning" title="Waiting for payment">
          Pay to confirm. If you close the payment window, use Pay now to open it again. Unpaid holds end on their own and nothing is
          charged.
        </FormMessage>
      );
    case "confirmed":
      return (
        <FormMessage tone="success" title="Booking confirmed">
          {booking.payment_mode === "at_property"
            ? `Pay ${formatINR(booking.grand_total_inr)} at the property when you check in. Nothing was charged online.`
            : booking.paid
              ? `Paid ${formatINR(booking.grand_total_inr)} online. Keep the Razorpay receipt.`
              : "We are confirming your payment. This page updates when it is done."}
        </FormMessage>
      );
    case "cancelled":
      return (
        <FormMessage tone="info" title={`Cancelled${booking.cancelled_at ? ` on ${formatDateTime(booking.cancelled_at)}` : ""}`}>
          {refundLine(booking)}
          {booking.cancel_reason ? <span className="mt-1 block text-muted-foreground">Reason: {booking.cancel_reason}</span> : null}
        </FormMessage>
      );
    case "expired":
      return (
        <FormMessage tone="info" title="This booking expired">
          The payment was not finished within {STAY_RULES.hold_minutes} minutes, so the hold ended. Nothing was charged and the beds are free
          again.
        </FormMessage>
      );
    case "completed":
      return (
        <FormMessage tone="success" title="Stay completed">
          Thanks for staying. We hope it went well.
        </FormMessage>
      );
  }
}

/** "12:34 left", ticking each second, from the hold's end time. Calls onEnded once when it reaches zero. */
export function HoldCountdown({ until, onEnded }: { until: string; onEnded?: () => void }) {
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Date.parse(until) - now);
  const over = left <= 0;
  useEffect(() => {
    if (over) {
      onEnded?.();
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [over, onEnded]);
  if (over) return <span>The hold has ended.</span>;
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <span>
      Beds held for <strong className="tabular-nums">{minutes}:{String(seconds).padStart(2, "0")}</strong>
    </span>
  );
}

/** Pay now for an unpaid hold: reopens Razorpay on the same order, then confirms with the server. */
function PayHold({ booking }: { booking: StayBooking }) {
  const queryClient = useQueryClient();
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const bookingId = booking.id;
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: stayKeys.detail(bookingId) });
    void queryClient.invalidateQueries({ queryKey: stayKeys.lists() });
  }, [queryClient, bookingId]);
  const holdEnded = useCallback(() => {
    setEnded(true);
    refresh();
  }, [refresh]);

  async function payNow() {
    setWorking(true);
    setProblem(null);
    try {
      const { payment } = await fetchStayPayment(booking.id);
      if (payment.mode !== "online") {
        refresh();
        return;
      }
      const outcome = await openRazorpayCheckout(payment, { name: booking.guest_name, email: booking.guest_email, contact: booking.guest_phone });
      if (outcome.kind === "paid") {
        await verifyStayPayment(booking.id, outcome.proof);
        refresh();
        return;
      }
      setProblem(
        outcome.kind === "unavailable"
          ? "The payment window could not load. Check your connection and try again."
          : outcome.kind === "failed"
            ? "The payment did not go through. You were not charged."
            : "Payment not finished.",
      );
    } catch (error) {
      setProblem(isApiError(error) ? error.message : "We could not confirm the payment yet. Refresh this page in a minute.");
      if (isApiError(error) && error.status === 409) refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-2">
      {booking.hold_expires_at ? (
        <p className="text-sm font-medium" role="timer">
          <HoldCountdown until={booking.hold_expires_at} onEnded={holdEnded} />
        </p>
      ) : null}
      {problem ? <FormMessage tone="warning">{problem}</FormMessage> : null}
      <Button type="button" size="xl" className="w-full sm:w-auto" disabled={working || ended} onClick={() => void payNow()}>
        {working ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <CreditCard data-icon="inline-start" aria-hidden />}
        Pay now
      </Button>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold">{children}</dd>
    </div>
  );
}

function downloadIcs(booking: StayBooking) {
  const blob = new Blob([buildStayIcs(booking, absoluteUrl(`/bookings/${booking.id}`))], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `zovia-stay-${booking.checkin}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Confirmation and manage page for a stay booking. */
export function StayBookingView({ booking }: { booking: StayBooking }) {
  const cancel = useCancelStay(booking.id);
  const [cancelNote, setCancelNote] = useState<string | null>(null);
  const bookingUrl = absoluteUrl(`/bookings/${booking.id}`);
  const listingUrl = absoluteUrl(`/properties/${booking.listing}`);
  const summary = bookingSummaryText(booking, bookingUrl);
  const shareText = `${booking.listing_title}, ${booking.locality}: ${formatStayDate(booking.checkin)} to ${formatStayDate(booking.checkout)} on Zovia`;
  const live = booking.status === "confirmed" || booking.status === "pending_payment";
  const onHold = booking.status === "pending_payment";

  function share(event: MouseEvent<HTMLAnchorElement>) {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      event.preventDefault();
      navigator.share({ title: "Zovia stay", text: shareText, url: listingUrl }).catch(() => {});
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={dynamicRoutes.property(booking.listing)} className="text-lg font-bold underline-offset-4 hover:underline">
            {booking.listing_title}
          </Link>
          <p className="text-sm text-muted-foreground">
            {booking.locality}, {booking.city} · Ref {booking.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <StayStatusBadge status={booking.status} />
      </div>

      <StatusMessage booking={booking} />
      {booking.status === "pending_payment" && booking.payment_mode === "online" ? <PayHold booking={booking} /> : null}
      {cancelNote ? <FormMessage tone="success">{cancelNote}</FormMessage> : null}

      <dl className="grid grid-cols-2 gap-4 rounded-2xl border border-border bg-card p-5 text-sm">
        <Fact label="Check-in">
          {formatStayDate(booking.checkin, true)}, {formatClock(STAY_RULES.check_in_time)}
        </Fact>
        <Fact label="Check-out">
          {formatStayDate(booking.checkout, true)}, {formatClock(STAY_RULES.check_out_time)}
        </Fact>
        <Fact label="Stay">{nightsLabel(booking.nights)}</Fact>
        <Fact label="Guests">{booking.guests}</Fact>
      </dl>

      <section aria-labelledby="price-heading" className="rounded-2xl border border-border bg-card p-5 text-sm">
        <h2 id="price-heading" className="text-base font-semibold">
          Price
        </h2>
        <ul className="mt-3 space-y-2.5 border-b border-border pb-3">
          {booking.lines.map((line) => (
            <li key={line.room_type} className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-medium">{lineTitle(line)}</span>
                <span className="text-xs text-muted-foreground">{lineMath(line)}</span>
              </span>
              <Money amount={line.line_total_inr} />
            </li>
          ))}
        </ul>
        <dl className="space-y-1.5 pt-3">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Stay total</dt>
            <dd>
              <Money amount={booking.stay_total_inr} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax ({booking.tax_percent}%)</dt>
            <dd>
              <Money amount={booking.tax_inr} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <dt>Total</dt>
            <dd>
              <Money amount={booking.grand_total_inr} />
            </dd>
          </div>
          <p className="text-xs text-muted-foreground">
            {booking.payment_mode === "at_property" ? "Paid at the property on check-in." : booking.paid ? "Paid online." : "Not paid yet."}
          </p>
        </dl>
      </section>

      <section aria-labelledby="guest-heading" className="rounded-2xl border border-border bg-card p-5 text-sm">
        <h2 id="guest-heading" className="text-base font-semibold">
          Guest
        </h2>
        <p className="mt-2 font-medium">{booking.guest_name}</p>
        <p className="text-muted-foreground">
          {booking.guest_phone} · {booking.guest_email}
        </p>
        {booking.special_requests ? <p className="mt-2 rounded-xl bg-muted/60 p-3">&ldquo;{booking.special_requests}&rdquo;</p> : null}
      </section>

      {live ? <PolicyTimeline checkin={booking.checkin} checkout={booking.checkout} freeCancelUntil={booking.free_cancel_until} /> : null}

      <div className="flex flex-wrap gap-2">
        {site.whatsappNumber ? (
          <a
            href={`https://wa.me/${site.whatsappNumber}?text=${encodeURIComponent(summary)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            <WhatsAppIcon className="text-[#128C4B]" />
            Send details on WhatsApp
          </a>
        ) : null}
        <a
          href={whatsappShareHref(shareText, listingUrl)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={share}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          <Share2 aria-hidden />
          Share
        </a>
        {booking.status !== "cancelled" && booking.status !== "expired" ? (
          <Button type="button" variant="outline" size="lg" onClick={() => downloadIcs(booking)}>
            <CalendarPlus data-icon="inline-start" aria-hidden />
            Add to calendar
          </Button>
        ) : null}
        {booking.status === "confirmed" || booking.status === "cancelled" ? (
          <Link href={`/bookings/${booking.id}/invoice` as Route} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <FileText data-icon="inline-start" aria-hidden />
            Receipt
          </Link>
        ) : null}
        {booking.status === "expired" || booking.status === "cancelled" ? (
          <Link
            href={listingHref(booking.listing, {
              checkin: booking.checkin,
              checkout: booking.checkout,
              rooms: booking.lines.map((line) => ({ room_type: line.room_type, qty: line.units })),
            })}
            className={buttonVariants({ size: "lg" })}
          >
            Book again
          </Link>
        ) : null}
      </div>

      {canCancel(booking) ? (
        <ConfirmDialog
          title={onHold ? "Cancel this hold?" : "Cancel this booking?"}
          description={refundPreview(booking)}
          confirmLabel={onHold ? "Cancel hold" : "Cancel booking"}
          cancelLabel={onHold ? "Keep hold" : "Keep booking"}
          destructive
          errorMessage={cancel.error?.message ?? "That did not work. Please try again."}
          onConfirm={async () => {
            const result = await cancel.mutateAsync(undefined);
            setCancelNote(
              result.refund_percent > 0
                ? `Booking cancelled. ${formatINR(result.booking.refund_inr)} (${result.refund_percent}%) will be refunded.`
                : "Booking cancelled.",
            );
          }}
          trigger={
            <Button type="button" variant="outline" size="lg">
              <X data-icon="inline-start" aria-hidden />
              {onHold ? "Cancel hold" : "Cancel booking"}
            </Button>
          }
        />
      ) : null}

      <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Sample listing: Zovia confirms details with the property and gets back to you before check-in.
      </p>
    </div>
  );
}

/**
 * /bookings/[id]: stay bookings first (the new kind), then the old long-stay booking rendered by
 * the server (`legacy`), so one link works for both.
 */
export function StayOrLegacyBooking({ id, legacy }: { id: string; legacy: ReactNode | null }) {
  const query = useStayBooking(id);
  if (query.isPending) return <LoadingState variant="detail" label="Loading booking" />;
  if (query.isError) {
    if (legacy) return <>{legacy}</>;
    return <ErrorState title="This booking did not load" onRetry={() => void query.refetch()} />;
  }
  if (query.data) return <StayBookingView booking={query.data} />;
  if (legacy) return <>{legacy}</>;
  return (
    <EmptyState
      title="Booking not found"
      description="It may belong to another account, or the link is wrong."
      action={
        <Link href={routes.bookings} className={buttonVariants({ variant: "outline", size: "lg" })}>
          My bookings
        </Link>
      }
    />
  );
}
