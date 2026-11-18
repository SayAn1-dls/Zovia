import { ChevronLeft, ChevronRight, Heart, UserRoundPen, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { DirectoryFilters } from "@/features/roommates/components/directory-filters";
import { DirectoryGrid } from "@/features/roommates/components/directory-grid";
import { DIRECTORY_PATH, directoryHref, parseDirectoryQuery } from "@/features/roommates/directory";
import { browseDirectory, listCities } from "@/features/roommates/service";
import { routes, signInHref } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";

export const metadata: Metadata = { title: "Browse roommates", robots: { index: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * /roommates/directory: everyone who chose to be listed. Signed-in users only; who appears and
 * which fields are shown is decided by roommate_directory() in the database.
 */
export default function RoommateDirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div>
      <PageHeader
        back={{ href: routes.roommates, label: "Roommates" }}
        title="Browse roommates"
        description="People who chose to be listed. Like someone to start; a chat opens when you both like each other."
        actions={
          <>
            <Link href={routes.roommateMatches} className={buttonVariants({ variant: "outline", size: "lg" })}>
              <Heart data-icon="inline-start" aria-hidden /> Matches
            </Link>
            <Link href={routes.roommateProfile} className={buttonVariants({ variant: "ghost", size: "lg" })}>
              <UserRoundPen data-icon="inline-start" aria-hidden /> Your listing
            </Link>
          </>
        }
      />
      <Suspense fallback={<LoadingState variant="card-grid" count={6} label="Loading roommates" />}>
        <DirectoryBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function DirectoryBody({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, user, requestId } = await getServiceContext();
  if (!user) redirect(signInHref(DIRECTORY_PATH));
  if (!isActiveStatus(user.status)) redirect(routes.accountSuspended);
  const ctx = { supabase, user, requestId };
  const query = parseDirectoryQuery(await searchParams);
  const [result, cities] = await Promise.all([browseDirectory(ctx, query), listCities(ctx)]);
  const filtered = query.city !== null || query.available !== null;

  return (
    <div className="space-y-6">
      <DirectoryFilters query={query} cities={cities} />

      {result.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={query.page > 1 ? "Nothing on this page" : filtered ? "Nobody matches these filters" : "Nobody is listed yet"}
          description={
            filtered
              ? "Try another city or show everyone."
              : "Profiles appear here once their owners choose to be listed. You can list yours from your roommate profile."
          }
          action={
            filtered || query.page > 1 ? (
              <Link href={DIRECTORY_PATH} className={buttonVariants({ variant: "outline", size: "lg" })}>
                Show everyone
              </Link>
            ) : (
              <Link href={routes.roommateProfile} className={buttonVariants({ size: "lg" })}>
                <UserRoundPen data-icon="inline-start" aria-hidden /> Edit your profile
              </Link>
            )
          }
        />
      ) : (
        <>
          {!result.can_like ? (
            <p className="rounded-2xl bg-muted px-4 py-3 text-sm">
              To like someone, make your own roommate profile live first.{" "}
              <Link href={routes.roommateProfile} className="font-semibold underline underline-offset-4">
                Go to your profile
              </Link>
            </p>
          ) : null}
          <DirectoryGrid items={result.items} canLike={result.can_like} />
        </>
      )}

      {query.page > 1 || result.has_more ? (
        <nav aria-label="Directory pages" className="flex items-center justify-between gap-3">
          {query.page > 1 ? (
            <Link
              href={directoryHref({ ...query, page: query.page - 1 })}
              className={buttonVariants({ variant: "outline", size: "lg" })}
              rel="prev"
            >
              <ChevronLeft data-icon="inline-start" aria-hidden /> Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground" aria-current="page">
            Page {query.page}
          </span>
          {result.has_more ? (
            <Link
              href={directoryHref({ ...query, page: query.page + 1 })}
              className={buttonVariants({ variant: "outline", size: "lg" })}
              rel="next"
            >
              Next <ChevronRight data-icon="inline-end" aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
