import type { Metadata } from "next";
import { Suspense } from "react";

import { FormSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { BasicsForm } from "@/features/owner/components/basics-form";
import { Panel } from "@/features/owner/components/bits";
import { ownerPageContext } from "@/features/owner/page-context";
import { routes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Add a property", robots: { index: false } };

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: routes.ownerProperties, label: "Properties" }}
        title="Add a property"
        description="Start with the basics. Next come the address, pricing, rooms and photos; it stays a private draft until you submit it."
      />
      <Suspense fallback={<FormSkeleton count={5} />}>
        <NewPropertyBody />
      </Suspense>
    </div>
  );
}

async function NewPropertyBody() {
  await ownerPageContext(routes.ownerNewProperty);
  return (
    <Panel>
      <BasicsForm property={null} />
    </Panel>
  );
}
