"use client";

import { ArrowRight, BedDouble, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { FormMessage } from "@/components/form/form-field";
import { Money } from "@/components/money";
import { useSession } from "@/components/session/session-context";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/client";

import { priceStay } from "../pricing";
import type { RoomSelection, StayAvailability, StayQuote, StayRequest } from "../schemas";
import { STAY_ROOM_LABELS, STAY_RULES } from "../schemas";
import { addDays } from "../hooks/stay-dates";
import { bookHref, bookNowTarget, listingHref, maxQtyFor, setRoomQty, unitsOf, useStaySelection } from "../hooks/stay-url-state";
import { useStayAvailability, useStayQuote } from "../hooks/use-stays";
import { bedsLabel } from "../hooks/stay-text";
import { DatesNotice } from "./dates-notice";
import { DateRangeFields } from "./date-range-fields";
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
    <div role="status" aria-busy="true" className="space-y-3">
      <span className="sr-only">Loading rooms</span>
      {[0, 1].map((key) => (
        <Skeleton key={key} className="h-40 w-full rounded-2xl" />
      ))}
    </div>
  );
}

/**
 * The listing page's booking column, Zostel style: dates, room-type cards with a bed stepper,
 * sold-out strips, and a sticky price summary with Book now. On phones a bottom bar shows the
 * payable amount and opens the summary in a sheet. All state is in the URL.
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
      <p className="mt-2 text-center text-xs text-muted-foreground">You&apos;ll sign in first. Nothing is charged until the last step.</p>
    ) : (
      <p className="mt-2 text-center text-xs text-muted-foreground">Free cancellation until {STAY_RULES.free_cancel_days} days before check-in.</p>
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
    </StaySummary>
  );

  return (
    <>
      <section id="book" aria-labelledby="book-heading" className="scroll-mt-32 space-y-5 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6">
        <div>
          <h2 id="book-heading" className="text-xl font-bold">
            Book your stay
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick dates, then beds. Up to {STAY_RULES.max_units} beds in one booking.</p>
        </div>
        <DatesNotice text={datesNotice} onDismiss={dismissDatesNotice} />
        <DateRangeFields dates={selection} onChange={(dates) => update(dates)} />

        <div>
          <h3 className="mb-3 text-base font-semibold">Rooms</h3>
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
            <div className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              <BedDouble className="mb-2 size-5" aria-hidden />
              No rooms are open for booking here yet. Ask a question below and we&apos;ll check with the property.
            </div>
          ) : (
            <ul className={availability.isPlaceholderData ? "space-y-3 opacity-60 transition-opacity" : "space-y-3"} aria-busy={availability.isFetching}>
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
            <p className="mt-2 text-xs text-muted-foreground">That&apos;s the most for one booking ({STAY_RULES.max_units} beds).</p>
          ) : null}
        </div>
      </section>

      <div className="hidden lg:sticky lg:top-28 lg:z-[5] lg:block lg:bg-background lg:pt-4">{summaryCard(false)}</div>

      <div
        className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-background/95 px-4 py-2.5 backdrop-blur lg:hidden"
        data-testid="stay-mobile-bar"
      >
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          {request === null ? (
            <>
              <p className="min-w-0 text-sm">
                <span className="block text-xs text-muted-foreground">Beds from</span>
                <Money amount={nightlyFrom} suffix=" /night" className="text-lg font-bold" />
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
                    <Money amount={summary.payable_now_inr} className="text-lg font-bold" />
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
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="pb-0">
            <SheetTitle>Your stay</SheetTitle>
            <SheetDescription>Check the price, then book.</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-5">{summaryCard(true)}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Server-render placeholder with the panel's footprint (the panel reads the URL, so it renders in the browser). */
export function StayBookingPanelSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-4 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6">
      <span className="sr-only">Loading booking</span>
      <Skeleton className="h-7 w-40" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-11 rounded-xl" />
        <Skeleton className="h-11 rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
