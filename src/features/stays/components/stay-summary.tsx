"use client";

import { CalendarDays } from "lucide-react";
import { useId, type ReactNode } from "react";

import { Money } from "@/components/money";
import { cn } from "@/lib/utils";

import type { StayQuote } from "../schemas";
import { formatStayDate, lineMath, lineTitle, nightsLabel } from "../hooks/stay-text";

export type SummaryData = Pick<
  StayQuote,
  "checkin" | "checkout" | "nights" | "lines" | "stay_total_inr" | "tax_percent" | "tax_inr" | "grand_total_inr" | "payable_now_inr"
>;

/**
 * The price summary: dates, "type × qty" lines with "₹unit × nights", stay total, tax with its
 * percent, total and payable now. `pending` dims the figures while the server quote is on its way
 * (the figures shown meanwhile are a preview; the server's quote replaces them).
 */
export function StaySummary({
  data,
  dates,
  pending = false,
  title = "Your stay",
  notice,
  children,
  className,
}: {
  data: SummaryData | null;
  /** Shown when there is no quote yet. */
  dates: { checkin: string; checkout: string; nights: number };
  pending?: boolean;
  /** null: no heading of its own (a sheet or dialog above already names it). */
  title?: string | null;
  /** A message above the totals (sold out, shortfall, error). */
  notice?: ReactNode;
  /** The call to action (Book now). */
  children?: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  const range = data ?? dates;
  return (
    <section
      aria-labelledby={title === null ? undefined : headingId}
      aria-label={title === null ? "Price details" : undefined}
      className={cn("rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6", className)}
    >
      {title === null ? null : (
        <h2 id={headingId} className="text-base font-semibold">
          {title}
        </h2>
      )}
      <p className={cn("flex items-center gap-1.5 text-sm", title !== null && "mt-2")}>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>
          {formatStayDate(range.checkin)} → {formatStayDate(range.checkout)}
          <span className="text-muted-foreground"> · {nightsLabel(range.nights)}</span>
        </span>
      </p>

      {notice ? <div className="mt-3">{notice}</div> : null}

      {data && data.lines.length > 0 ? (
        <div aria-busy={pending} className={cn("mt-4 transition-opacity", pending && "opacity-60")}>
          <ul className="space-y-2.5 border-b border-border pb-3 text-sm">
            {data.lines.map((line) => (
              <li key={line.room_type} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block font-medium">{lineTitle(line)}</span>
                  <span className="text-xs text-muted-foreground">{lineMath(line)}</span>
                </span>
                <Money amount={line.line_total_inr} className="font-medium" />
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Stay total</dt>
              <dd>
                <Money amount={data.stay_total_inr} />
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Tax ({data.tax_percent}%)</dt>
              <dd>
                <Money amount={data.tax_inr} />
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <dt>Total</dt>
              <dd>
                <Money amount={data.grand_total_inr} />
              </dd>
            </div>
          </dl>
          <div className="flex items-baseline justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
            <span className="text-sm font-semibold">Payable now</span>
            <Money amount={data.payable_now_inr} className="text-xl font-bold" />
          </div>
          <p className="sr-only" aria-live="polite">
            {pending ? "Updating the price." : `Payable now ₹${data.payable_now_inr.toLocaleString("en-IN")}.`}
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">Select a bed to see the price.</p>
      )}

      {children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

/** Same footprint as the summary, for first load. */
export function StaySummarySkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-3 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6">
      <span className="sr-only">Loading the price</span>
      <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      <div className="h-24 animate-pulse rounded-2xl bg-muted" />
      <div className="h-13 animate-pulse rounded-full bg-muted" />
    </div>
  );
}
