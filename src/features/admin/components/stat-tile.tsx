import type { Route } from "next";
import Link from "next/link";

import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A labelled count. Links when `href` is given. (Same as the owner module's; candidate for components/.) */
export function StatTile({
  label,
  value,
  href,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  href?: Route;
  /** Small context line under the number, e.g. "last 7 days". */
  hint?: string;
  tone?: "default" | "attention";
}) {
  const body = (
    <>
      <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className="mt-2 block font-heading text-3xl font-bold tabular-nums">{formatNumber(value)}</span>
      {hint ? <span className="mt-1 block text-xs text-muted-foreground">{hint}</span> : null}
    </>
  );
  const className = cn(
    "block rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5",
    tone === "attention" && value > 0 && "bg-lime ring-ink/10",
    href && "transition-colors duration-150 hover:ring-foreground",
  );
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
