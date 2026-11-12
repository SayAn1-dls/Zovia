import { formatINR, formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

type MoneyProps = {
  /** Integer INR. null/undefined renders a dash. */
  amount: number | null | undefined;
  /** "₹8.5k" style for chips and tight spaces. */
  compact?: boolean;
  /** Appended in muted text, e.g. "/month" or "/bed". */
  suffix?: string;
  className?: string;
};

/** INR amount with Indian digit grouping (₹1,25,000) and tabular figures. */
export function Money({ amount, compact = false, suffix, className }: MoneyProps) {
  const text = compact ? formatINRCompact(amount) : formatINR(amount);
  return (
    <span className={cn("tabular-nums whitespace-nowrap", className)}>
      {text}
      {suffix && amount !== null && amount !== undefined ? (
        <span className="text-[0.8em] font-normal text-muted-foreground">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
