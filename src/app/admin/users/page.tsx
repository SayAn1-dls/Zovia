import { Search, Users } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/pagination";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePage } from "@/features/admin/schemas";
import { listUsers, staffPageContext } from "@/features/admin/service";
import { formatDate } from "@/lib/format";
import { routes, withQuery } from "@/lib/navigation";

export const metadata: Metadata = { title: "Users", robots: { index: false } };

export default function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  return (
    <>
      <PageHeader title="Users" description="Everyone with an account. Read-only: moderation tools arrive with the moderation module." />
      <Suspense fallback={<LoadingState variant="list" count={6} label="Loading users" />}>
        <UsersBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function UsersBody({ searchParams }: { searchParams: PageProps<"/admin/users">["searchParams"] }) {
  const ctx = await staffPageContext();
  const query = await searchParams;
  const search = typeof query.q === "string" && query.q.trim() ? query.q.trim().slice(0, 100) : null;
  const page = parsePage(query.page);
  const data = await listUsers(ctx, search, page);
  const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));

  return (
    <div className="space-y-5">
      <form action={routes.adminUsers} method="get" role="search" className="flex gap-2">
        <label htmlFor="user-search" className="sr-only">
          Search by e-mail
        </label>
        <Input id="user-search" name="q" type="search" defaultValue={search ?? ""} placeholder="Search by e-mail" className="max-w-sm" />
        <Button type="submit" size="lg" variant="outline">
          <Search data-icon="inline-start" aria-hidden />
          Search
        </Button>
      </form>
      {data.rows.length === 0 ? (
        <EmptyState icon={Users} title={search ? "No matching users" : "No users yet"} description={search ? "Try another e-mail address." : undefined} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card ring-1 ring-border" aria-label="Users">
          {data.rows.map((user) => (
            <li key={user.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold break-words">{user.display_name}</p>
                <p className="text-sm break-all text-muted-foreground">{user.email ?? "No e-mail"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatusBadge status={user.status} />
                {user.roles.map((role) => (
                  <span key={role} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold capitalize">
                    {role}
                  </span>
                ))}
                {!user.onboarded ? <span className="text-xs text-muted-foreground">not onboarded</span> : null}
                <span className="text-xs text-muted-foreground">joined {formatDate(user.created_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={totalPages} hrefForPage={(p) => withQuery(routes.adminUsers, { q: search, page: p })} />
    </div>
  );
}
