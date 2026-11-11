import { BadgeCheck, CalendarCheck, FileCheck2, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The three independent trust signals (spec section 6.2). They are never
 * merged into one generic tick: each has its own icon, colour and wording.
 */
export type VerificationKind = "owner" | "authorisation" | "recently_confirmed";

export const verificationSignals: Record<
  VerificationKind,
  { label: string; description: string; icon: LucideIcon; className: string; iconWrap: string }
> = {
  owner: {
    label: "Owner verified",
    description:
      "Our team reviewed the owner's identity documents. A verified phone number alone never earns this.",
    icon: BadgeCheck,
    className: "bg-success-surface text-success-foreground",
    iconWrap: "bg-success-surface text-success-foreground",
  },
  authorisation: {
    label: "Authorisation verified",
    description:
      "Our team checked that the lister has the right to let this specific property.",
    icon: FileCheck2,
    className: "bg-info-surface text-info-foreground",
    iconWrap: "bg-info-surface text-info-foreground",
  },
  recently_confirmed: {
    label: "Recently confirmed",
    description:
      "The owner confirmed in the last 30 days that this listing and its availability are still accurate.",
    icon: CalendarCheck,
    className: "bg-secondary text-secondary-foreground",
    iconWrap: "bg-secondary text-violet-strong",
  },
};

type VerifiedBadgeProps = {
  kind: VerificationKind;
  /** "icon" shows the glyph only (the label stays available to assistive tech). */
  display?: "full" | "icon";
  className?: string;
};

/** One trust signal as a pill. Render only signals that are actually true for the listing. */
export function VerifiedBadge({ kind, display = "full", className }: VerifiedBadgeProps) {
  const signal = verificationSignals[kind];
  const Icon = signal.icon;
  return (
    <span
      title={signal.description}
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full text-xs font-semibold whitespace-nowrap",
        display === "icon" ? "w-6 justify-center" : "px-2.5",
        signal.className,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {display === "icon" ? (
        <span className="sr-only">{signal.label}</span>
      ) : (
        signal.label
      )}
    </span>
  );
}
