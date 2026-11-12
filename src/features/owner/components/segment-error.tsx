"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";

/** Error boundary body for owner and admin segments (Next 16: `retry` re-renders the segment). */
export function SegmentError({ error, retry, title = "This page did not load" }: { error: unknown; retry: () => void; title?: string }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title={title}
      description="Something went wrong while loading this page. Try again; if it keeps happening, contact support with the reference."
      reference={digest}
      onRetry={retry}
    />
  );
}
