import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { PropertyEditor } from "@/features/owner/components/property-editor";
import { ownerPageContext } from "@/features/owner/page-context";
import { EDITOR_TABS, type EditorTab } from "@/features/owner/schemas";
import { getEditorReference, getPropertyDetail } from "@/features/owner/service";
import { dynamicRoutes, routes } from "@/lib/navigation";
import { isAppError } from "@/server/http/errors";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };

export default function EditPropertyPage({ params, searchParams }: PageProps<"/owner/properties/[id]">) {
  return (
    <Suspense fallback={<LoadingState variant="detail" label="Loading listing" />}>
      <EditorBody params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function EditorBody({
  params,
  searchParams,
}: {
  params: PageProps<"/owner/properties/[id]">["params"];
  searchParams: PageProps<"/owner/properties/[id]">["searchParams"];
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = await ownerPageContext(dynamicRoutes.ownerProperty(id));
  let property;
  try {
    property = await getPropertyDetail(ctx, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }
  const reference = await getEditorReference(ctx);
  const tab = typeof query.tab === "string" && (EDITOR_TABS as readonly string[]).includes(query.tab) ? (query.tab as EditorTab) : "basics";

  return (
    <>
      <PageHeader back={{ href: routes.ownerProperties, label: "Properties" }} title={property.title} />
      <PropertyEditor property={property} cities={reference.cities} amenities={reference.amenities} initialTab={tab} />
    </>
  );
}
