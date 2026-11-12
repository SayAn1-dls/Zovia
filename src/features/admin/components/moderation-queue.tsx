import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime } from "@/lib/format";

import type { AdminModerationRow, Paged } from "../schemas";

/** Read-only moderation queue: the rows are real; deciding them needs SQL functions not yet built. */
export function ModerationQueue({
  data,
  icon,
  emptyTitle,
  emptyDescription,
  notice,
  hrefForPage,
}: {
  data: Paged<AdminModerationRow>;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  notice: string;
  hrefForPage: (page: number) => Route;
}) {
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div className="space-y-5">
      <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
        <span className="font-semibold">Read-only for now. </span>
        {notice}
      </p>
      {data.rows.length === 0 ? (
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} />
      ) : (
        <ul className="space-y-3">
          {data.rows.map((row) => (
            <li key={row.id} className="space-y-1.5 rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold capitalize">{row.title}</p>
                <StatusBadge status={row.status} />
              </div>
              <p className="text-sm break-words text-muted-foreground">
                {row.people} · {formatDateTime(row.created_at)}
              </p>
              {row.details ? <p className="text-sm break-words whitespace-pre-line">{row.details}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={data.page} totalPages={totalPages} hrefForPage={hrefForPage} />
    </div>
  );
}
