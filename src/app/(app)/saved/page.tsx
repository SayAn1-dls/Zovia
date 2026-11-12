import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { SavedList } from "@/features/properties/components/saved-list";
import { listSavedProperties } from "@/features/properties/service";
import { routes } from "@/lib/navigation";
import { getServiceContext, isActiveStatus } from "@/server/auth";
import { clampPagination } from "@/server/http/pagination";

export const metadata: Metadata = { title: "Saved", robots: { index: false } };

const PAGE_SIZE = 24;

/** /saved (private; the proxy guards it and the body re-checks the session inside Suspense). */
export default function SavedPage({ searchParams }: PageProps<"/saved">) {
  return (
    <>
      <PageHeader title="Saved" description="Places you've kept for later." />
      <Suspense fallback={<LoadingState variant="card-grid" count={3} label="Loading saved places" />}>
        <SavedBody searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function SavedBody({ searchParams }: Pick<PageProps<"/saved">, "searchParams">) {
  const ctx = await getServiceContext();
  if (!ctx.user) redirect(`${routes.signIn}?next=${encodeURIComponent(routes.saved)}`);
  if (!isActiveStatus(ctx.user.status)) redirect(routes.accountSuspended);
  const { page } = clampPagination({ page: (await searchParams).page, limit: PAGE_SIZE });
  const { items, meta } = await listSavedProperties({ ...ctx, user: ctx.user }, { page, limit: PAGE_SIZE });
  return <SavedList items={items} page={meta.page} totalPages={Math.max(1, Math.ceil(meta.total / meta.limit))} />;
}
