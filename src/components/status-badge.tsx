import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const toneClasses: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success-surface text-success-foreground",
  warning: "bg-warning-surface text-warning-foreground",
  danger: "bg-danger-surface text-danger-foreground",
  info: "bg-card text-foreground ring-1 ring-inset ring-foreground/25",
  brand: "bg-lime text-ink",
};

const dotClasses: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground",
  success: "bg-success-foreground",
  warning: "bg-warning-foreground",
  danger: "bg-danger-foreground",
  info: "bg-foreground",
  brand: "bg-ink",
};

/**
 * Tone and label for every status enum in the data model (spec section 6).
 * Keys are the database enum values, so features pass `row.status` straight in.
 */
export const statusPresets = {
  // Listing lifecycle
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "In review", tone: "warning" },
  published: { label: "Published", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
  rejected: { label: "Rejected", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
  // Property availability
  available: { label: "Available", tone: "success" },
  limited: { label: "Filling fast", tone: "warning" },
  fully_occupied: { label: "Fully occupied", tone: "neutral" },
  coming_soon: { label: "Coming soon", tone: "info" },
  unavailable: { label: "Unavailable", tone: "neutral" },
  // Beds
  reserved: { label: "Reserved", tone: "warning" },
  occupied: { label: "Occupied", tone: "neutral" },
  blocked: { label: "Blocked", tone: "neutral" },
  // Enquiries
  new: { label: "New", tone: "brand" },
  responded: { label: "Responded", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  spam: { label: "Spam", tone: "danger" },
  // Reports, appeals, verification
  open: { label: "Open", tone: "warning" },
  in_review: { label: "In review", tone: "info" },
  resolved: { label: "Resolved", tone: "success" },
  dismissed: { label: "Dismissed", tone: "neutral" },
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  verified: { label: "Verified", tone: "success" },
  unverified: { label: "Not verified", tone: "neutral" },
  // Accounts and profiles
  active: { label: "Active", tone: "success" },
  restricted: { label: "Restricted", tone: "warning" },
  suspended: { label: "Suspended", tone: "danger" },
  deleted: { label: "Deleted", tone: "neutral" },
  // Reviews
  hidden: { label: "Hidden", tone: "neutral" },
  removed: { label: "Removed", tone: "danger" },
} as const satisfies Record<string, { label: string; tone: StatusTone }>;

export type KnownStatus = keyof typeof statusPresets;

type StatusBadgeProps = {
  /** A database status value. Unknown values render neutrally with a readable label. */
  status: KnownStatus | (string & {});
  /** Override the preset label. */
  label?: string;
  /** Override the preset tone. */
  tone?: StatusTone;
  /** Leading dot (default true). */
  dot?: boolean;
  className?: string;
};

function humanise(status: string): string {
  const text = status.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Unknown";
}

/** Status pill for listings, beds, enquiries, reports and accounts. */
export function StatusBadge({ status, label, tone, dot = true, className }: StatusBadgeProps) {
  const preset = (statusPresets as Record<string, { label: string; tone: StatusTone }>)[status];
  const resolvedTone = tone ?? preset?.tone ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        toneClasses[resolvedTone],
        className,
      )}
    >
      {dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dotClasses[resolvedTone])} />
      ) : null}
      {label ?? preset?.label ?? humanise(status)}
    </span>
  );
}
