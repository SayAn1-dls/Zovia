import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { PropertyList } from "@/features/owner/components/property-list";
import { ownerPageContext } from "@/features/owner/page-context";
import { listProperties } from "@/features/owner/service";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Your properties", robots: { index: false } };

export default function OwnerPropertiesPage() {
  return (
    <>
      <PageHeader
        title="Properties"
        description="Drafts, listings in review and live listings. Only published listings appear in search."
        actions={
          <Link href={routes.ownerNewProperty} className={buttonVariants({ size: "lg" })}>
            <Plus data-icon="inline-start" aria-hidden />
            Add a property
          </Link>
        }
      />
      <Suspense fallback={<LoadingState variant="list" count={3} label="Loading your listings" />}>
        <PropertiesBody />
      </Suspense>
    </>
  );
}

async function PropertiesBody() {
  const ctx = await ownerPageContext(routes.ownerProperties);
  const properties = await listProperties(ctx);
  return <PropertyList properties={properties} />;
}
