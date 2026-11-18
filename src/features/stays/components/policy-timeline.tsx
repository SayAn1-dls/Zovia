import { BadgeCheck, CircleSlash, DoorOpen, IdCard, LogOut, Users } from "lucide-react";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

import { STAY_RULES } from "../schemas";
import { addDays } from "../hooks/stay-dates";
import { formatClock, formatStayDate, freeCancelDeadline } from "../hooks/stay-text";

/**
 * Cancellation and house policy as a short timeline: free cancellation until 7 days before
 * check-in (1 PM), then no refund; check-in and check-out times; 18+ with ID; max 8 beds.
 */
export function PolicyTimeline({
  checkin,
  checkout,
  freeCancelUntil,
  className,
}: {
  checkin: string;
  checkout: string;
  /** From the booking when known; otherwise computed from check-in. null when the free window has passed. */
  freeCancelUntil?: string | null;
  className?: string;
}) {
  const deadline = freeCancelUntil === undefined ? freeCancelDeadline(checkin) : freeCancelUntil;
  const steps = [
    {
      icon: BadgeCheck,
      tone: "success" as const,
      title: deadline ? `Free cancellation until ${formatDateTime(deadline)}` : "Free cancellation has ended",
      body: deadline
        ? `Cancel up to ${STAY_RULES.free_cancel_days} days before check-in for a full refund of what you paid online.`
        : `It ended ${STAY_RULES.free_cancel_days} days before check-in (${formatStayDate(addDays(checkin, -STAY_RULES.free_cancel_days))}).`,
    },
    {
      icon: CircleSlash,
      tone: "danger" as const,
      title: "No refund after that",
      body: `From ${STAY_RULES.free_cancel_days} days before check-in, cancelling refunds nothing and dates can't be changed.`,
    },
    {
      icon: DoorOpen,
      tone: "neutral" as const,
      title: `Check-in ${formatStayDate(checkin)}, ${formatClock(STAY_RULES.check_in_time)}`,
      body: null,
    },
    {
      icon: LogOut,
      tone: "neutral" as const,
      title: `Check-out ${formatStayDate(checkout)}, ${formatClock(STAY_RULES.check_out_time)}`,
      body: null,
    },
  ];

  return (
    <section aria-labelledby="policy-heading" className={cn("rounded-2xl bg-card p-5 ring-1 ring-border", className)}>
      <h2 id="policy-heading" className="text-base font-semibold">
        Cancellation policy
      </h2>
      <ol className="mt-4 space-y-0">
        {steps.map(({ icon: Icon, tone, title, body }, index) => (
          <li key={title} className="relative flex gap-3 pb-4 last:pb-0">
            {index < steps.length - 1 ? <span aria-hidden className="absolute top-8 bottom-0 left-4 w-px bg-border" /> : null}
            <span
              className={cn(
                "relative flex size-8 shrink-0 items-center justify-center rounded-full",
                tone === "success" && "bg-success-surface text-success-foreground",
                tone === "danger" && "bg-danger-surface text-danger-foreground",
                tone === "neutral" && "bg-muted text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 pt-1">
              <p className="text-sm font-semibold">{title}</p>
              {body ? <p className="mt-0.5 text-sm text-muted-foreground">{body}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-4 grid grid-cols-1 gap-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <IdCard className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          18+ only. Bring a photo ID to check in.
        </li>
        <li className="flex items-center gap-2">
          <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          At most {STAY_RULES.max_units} beds per booking.
        </li>
      </ul>
    </section>
  );
}
