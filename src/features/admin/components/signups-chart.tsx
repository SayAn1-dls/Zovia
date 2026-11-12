import { formatDate, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };

/**
 * Sign-ups per day as a plain bar chart (no chart library). Bars are decorative for screen
 * readers; the same numbers are in a visually hidden table.
 */
export function SignupsChart({ points }: { points: { day: string; count: number }[] }) {
  const max = Math.max(0, ...points.map((point) => point.count));
  const total = points.reduce((sum, point) => sum + point.count, 0);
  const first = points[0];
  const last = points[points.length - 1];

  if (points.length === 0 || total === 0) {
    return (
      <p className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">
        No sign-ups in the last 30 days yet.
      </p>
    );
  }

  return (
    <figure className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">Sign-ups per day</span>
        <span className="text-xs text-muted-foreground">
          {formatNumber(total)} in 30 days · peak {formatNumber(max)}/day
        </span>
      </figcaption>
      <div className="mt-4 flex h-40 items-end gap-[2px] sm:gap-1" aria-hidden>
        {points.map((point) => (
          <div key={point.day} className="group relative flex h-full flex-1 items-end" title={`${formatDate(point.day)}: ${point.count}`}>
            <div
              className={cn("w-full rounded-t-sm", point.count > 0 ? "bg-foreground/80 group-hover:bg-foreground" : "bg-muted")}
              style={{ height: point.count > 0 ? `${Math.max(4, (point.count / max) * 100)}%` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground" aria-hidden>
        <span>{first ? formatDate(first.day, SHORT) : ""}</span>
        <span>{last ? formatDate(last.day, SHORT) : ""}</span>
      </div>
      <table className="sr-only">
        <caption>Sign-ups per day, last 30 days</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Sign-ups</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.day}>
              <td>{formatDate(point.day)}</td>
              <td>{point.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
