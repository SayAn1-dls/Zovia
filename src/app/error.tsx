"use client";

import Link from "next/link";
import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";
import { buttonVariants } from "@/components/ui/button";
import { routes } from "@/lib/navigation";

/** Route-level error boundary (Next 16: `retry` re-fetches and re-renders the segment). */
export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[70dvh] flex-1 items-center justify-center px-5 py-16 outline-none">
      <ErrorState
        variant="plain"
        title="Something went wrong"
        description="This page hit a problem. Try again, and if it keeps happening, let us know."
        reference={digest}
        onRetry={retry}
        action={
          <Link href={routes.home} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Go home
          </Link>
        }
      />
    </main>
  );
}
