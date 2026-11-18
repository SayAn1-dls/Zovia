"use client";

import { ArrowRight, BedDouble, RotateCw, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormMessage } from "@/components/form/form-field";
import { Money } from "@/components/money";
import { useSession } from "@/components/session/session-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { priceStay } from "../pricing";
import type { RoomSelection, StayAvailability, StayQuote, StayRequest } from "../schemas";
import { STAY_ROOM_LABELS, STAY_RULES } from "../schemas";
import { addDays } from "../hooks/stay-dates";
import { bookHref, bookNowTarget, listingHref, maxQtyFor, setRoomQty, unitsOf, useStaySelection } from "../hooks/stay-url-state";
import { useStayAvailability, useStayQuote } from "../hooks/use-stays";
import { bedsLabel } from "../hooks/stay-text";
import { DatesNotice } from "./dates-notice";
import { DateRangeFields } from "./date-range-fields";
import { QUESTION_ID, openQuestion } from "./question-disclosure";
import { RoomTypeCard } from "./room-type-card";
import { StaySummary, type SummaryData } from "./stay-summary";

/** A price preview from the availability's unit prices while the server quote loads. Display only. */
export function previewSummary(
  availability: StayAvailability | undefined,
  selection: { checkin: string; checkout: string; nights: number; rooms: readonly RoomSelection[] },
): SummaryData | null {
  if (!availability || selection.rooms.length === 0) return null;
  const rooms = selection.rooms.flatMap((room) => {
    const offered = availability.rooms.find((candidate) => candidate.room_type === room.room_type);
    return offered ? [{ room_type: room.room_type, units: room.qty, rent_per_month_inr: offered.rent_per_month_inr }] : [];
  });
  if (rooms.length === 0) return null;
  try {
    const price = priceStay({ nights: selection.nights, rooms });
    return { checkin: selection.checkin, checkout: selection.checkout, nights: selection.nights, ...price };
  } catch {
    return null;
  }
}

/** Plain words for a quote that cannot be booked as it stands. */
export function shortfallText(quote: Pick<StayQuote, "shortfalls">): string {
  const parts = quote.shortfalls.map((short) =>
    short.available === 0
      ? `${STAY_ROOM_LABELS[short.room_type]} is sold out`
      : `${STAY_ROOM_LABELS[short.room_type]} has only ${bedsLabel(short.available)} left`,
  );
  return `${parts.join("; ") || "Some beds are no longer free"} for these dates. Change the dates or the number of beds.`;
}

function RoomsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4">
      <span className="sr-only">Loading rooms</span>
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-24 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * The listing page's booking column, Zostel style: dates, room types with a bed stepper,
 * sold-out strips, and a price summary with Book now. All state is in the URL.
 *
 * Layout: the panel and its summary share ONE wrapper, and the summary is sticky only inside
 * it, so it can never slide over anything outside the booking panel (the question form below
 * used to scroll under it). Phones: no inline summary; a bottom bar shows the payable amount and
 * opens the summary in a sheet. Tablets: rooms and summary side by side. Desktop: the wrapper
 * fills the booking column and the summary follows the page down to the column's end.
 */
export function StayBookingPanel({ slug, nightlyFrom }: { slug: string; nightlyFrom: number }) {
  const router = useRouter();
  const session = useSession();
  const { selection, update, datesNotice, dismissDatesNotice } = useStaySelection();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const availability = useStayAvailability({ listing: slug, checkin: selection.checkin, checkout: selection.checkout });
  const offered = availability.data?.rooms;
  const rooms = useMemo(
    () => (offered ? selection.rooms.filter((room) => offered.some((candidate) => candidate.room_type === room.room_type)) : selection.rooms),
    [offered, selection.rooms],
  );
  const units = unitsOf(rooms);

  const request: StayRequest | null =
    rooms.length > 0 ? { listing: slug, checkin: selection.checkin, checkout: selection.checkout, rooms } : null;
  const quote = useStayQuote(request);
  const fresh = request !== null && quote.data !== undefined && !quote.isPlaceholderData;
  const preview = previewSummary(availability.data, { ...selection, rooms });
  const summary: SummaryData | null = request === null ? null : fresh ? quote.data! : (preview ?? quote.data ?? null);
  const pending = request !== null && !fresh && !quote.isError;
  const bookable = fresh && quote.data!.available && !quote.isError;

  const setQty = (roomType: RoomSelection["room_type"], qty: number, max: number) => update({ rooms: setRoomQty(rooms, roomType, qty, max) });

  function bookNow() {
    if (!bookable) return;
    setNavigating(true);
    setSheetOpen(false);
    router.push(bookNowTarget(bookHref(slug, { ...selection, rooms }), session.status !== "signed_out"));
  }

  const notice =
    request === null ? null : quote.isError ? (
      <FormMessage tone="danger">
        <span className="flex flex-wrap items-center justify-between gap-2">
          {isApiError(quote.error) ? quote.error.message : "We could not get a price. Check your connection."}
          <Button type="button" variant="outline" size="sm" onClick={() => void quote.refetch()}>
            <RotateCw data-icon="inline-start" aria-hidden />
            Try again
          </Button>
        </span>
      </FormMessage>
    ) : fresh && !quote.data!.available ? (
      <FormMessage tone="warning">{shortfallText(quote.data!)}</FormMessage>
    ) : null;

  const bookButton = (
    <Button type="button" size="xl" className="w-full" disabled={!bookable || navigating} onClick={bookNow}>
      Book now
      <ArrowRight data-icon="inline-end" aria-hidden />
    </Button>
  );
  const bookHint =
    request === null ? null : session.status === "signed_out" ? (
      <p className="mt-3 text-center text-xs text-muted-foreground">You&apos;ll sign in first. Nothing is charged until the last step.</p>
    ) : (
      <p className="mt-3 text-center text-xs text-muted-foreground">Free cancellation until {STAY_RULES.free_cancel_days} days before check-in.</p>
    );

  const summaryCard = (inSheet: boolean) => (
    <StaySummary
      data={summary}
      dates={selection}
      pending={pending}
      notice={notice}
      title={inSheet ? null : "Your stay"}
      className={inSheet ? "p-0 ring-0 sm:p-0" : undefined}
    >
      {bookButton}
      {bookHint}
      {inSheet ? null : (
        <p className="mt-4 border-t border-border pt-4 text-center text-sm">
          <a href={`#${QUESTION_ID}`} onClick={openQuestion} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
            Have a question? Ask us
          </a>
        </p>
      )}
    </StaySummary>
  );

  return (
    <div
      data-testid="stay-booking"
      className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_18rem] md:items-start lg:flex lg:flex-1 lg:flex-col lg:items-stretch"
    >
      <section id="book" aria-labelledby="book-heading" className="scroll-mt-32 rounded-3xl bg-card p-6 ring-1 ring-border sm:p-7">
        <h2 id="book-heading" className="text-xl font-bold">
          Book your stay
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">Pick your dates, then your beds. Up to {STAY_RULES.max_units} in one booking.</p>
        {datesNotice ? (
          <div className="mt-5">
            <DatesNotice text={datesNotice} onDismiss={dismissDatesNotice} />
          </div>
        ) : null}
        <div className="mt-6">
          <DateRangeFields dates={selection} onChange={(dates) => update(dates)} />
        </div>

        <div className="mt-8">
          <h3 className="font-sans text-xs font-semibold tracking-wider text-muted-foreground uppercase">Rooms</h3>
          <div className="mt-2 border-t border-border pt-4">
            {availability.isPending ? (
              <RoomsSkeleton />
            ) : availability.isError && !availability.data ? (
              <FormMessage tone="danger" title="Rooms did not load">
                <p>{isApiError(availability.error) ? availability.error.message : "Check your connection and try again."}</p>
                <Button type="button" variant="outline" size="lg" className="mt-2" onClick={() => void availability.refetch()}>
                  <RotateCw data-icon="inline-start" aria-hidden />
                  Try again
                </Button>
              </FormMessage>
            ) : availability.data && availability.data.rooms.length === 0 ? (
              <p className="flex items-start gap-3 text-sm text-muted-foreground">
                <BedDouble className="mt-0.5 size-5 shrink-0" aria-hidden />
                <span>
                  No rooms are open for booking here yet.{" "}
                  <a href={`#${QUESTION_ID}`} onClick={openQuestion} className="font-medium text-foreground underline underline-offset-4">
                    Ask a question
                  </a>{" "}
                  and we&apos;ll check with the property.
                </span>
              </p>
            ) : (
              <ul
                className={cn("divide-y divide-border", availability.isPlaceholderData && "opacity-60 transition-opacity")}
                aria-busy={availability.isFetching}
              >
                {availability.data!.rooms.map((room) => {
                  const firstSoldOut = availability.data!.rooms.find((candidate) => candidate.sold_out)?.room_type;
                  const qty = rooms.find((selected) => selected.room_type === room.room_type)?.qty ?? 0;
                  const max = maxQtyFor(room.room_type, rooms, room.units_left);
                  return (
                    <RoomTypeCard
                      key={room.room_type}
                      room={room}
                      qty={qty}
                      max={max}
                      onQtyChange={(next) => setQty(room.room_type, next, Math.max(max, Math.min(next, qty)))}
                      onPickNight={(date) => update({ checkin: date, checkout: addDays(date, selection.nights) })}
                      alternatives={room.room_type === firstSoldOut ? availability.data!.alternatives : undefined}
                      alternativeHref={(other) => listingHref(other, { ...selection, rooms: [] })}
                    />
                  );
                })}
              </ul>
            )}
            {units >= STAY_RULES.max_units ? (
              <p className="mt-4 text-xs text-muted-foreground">That&apos;s the most for one booking ({STAY_RULES.max_units} beds).</p>
            ) : null}
          </div>
        </div>
      </section>

      {/*
        Sticky only inside the wrapper above, and only on screens tall enough to show the whole
        card, so the card can never cover the panel's neighbours or hide its own Book now.
      */}
      <div data-testid="stay-summary" className="hidden md:block md:top-32 md:[@media(min-height:44rem)]:sticky">
        {summaryCard(false)}
      </div>

      {/* Phones and tablets: the payable amount and one action. The page reserves room for it at the bottom. */}
      <div
        data-stay-bar
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background px-4 lg:hidden"
        data-testid="stay-mobile-bar"
      >
        <div className="mx-auto flex h-[4.25rem] max-w-xl items-center justify-between gap-4">
          {request === null ? (
            <>
              <p className="min-w-0 text-sm">
                <span className="block text-xs text-muted-foreground">Beds from</span>
                <Money amount={nightlyFrom} suffix=" /night" className="text-xl font-semibold tracking-tight" />
              </p>
              <a href="#book" className={buttonVariants({ size: "lg" })}>
                Select rooms
              </a>
            </>
          ) : (
            <>
              {/* A div, not a p: the loading Skeleton below is a div, and a div inside a p breaks hydration. */}
              <div className="min-w-0 text-sm">
                <span className="block text-xs text-muted-foreground">Payable now</span>
                {summary ? (
                  <span className={pending ? "opacity-60" : undefined}>
                    <Money amount={summary.payable_now_inr} className="text-xl font-semibold tracking-tight" />
                  </span>
                ) : quote.isError || availability.isError ? (
                  <span className="block font-semibold text-danger-foreground">Price unavailable</span>
                ) : (
                  <Skeleton className="mt-1 h-6 w-20" />
                )}
              </div>
              <Button type="button" size="lg" onClick={() => setSheetOpen(true)}>
                View summary
              </Button>
            </>
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="flex-row items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="min-w-0">
              <SheetTitle className="text-lg font-bold">Your stay</SheetTitle>
              <SheetDescription>Check the price, then book.</SheetDescription>
            </div>
            <SheetClose render={<Button type="button" variant="ghost" size="icon-lg" className="-mt-2 -mr-2 shrink-0" />}>
              <XIcon aria-hidden />
              <span className="sr-only">Close</span>
            </SheetClose>
          </SheetHeader>
          <div className="px-6 pb-6">{summaryCard(true)}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** Server-render placeholder with the panel's footprint (the panel reads the URL, so it renders in the browser). */
export function StayBookingPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6 rounded-3xl bg-card p-6 ring-1 ring-border sm:p-7">
      <span className="sr-only">Loading booking</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-[4.5rem] rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}
