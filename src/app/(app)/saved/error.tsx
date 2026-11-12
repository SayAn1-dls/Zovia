"use client";

import { ErrorState } from "@/components/feedback/error-state";

/** /saved failed as a whole (e.g. the shell itself). `retry` re-renders the segment. */
export default function SavedError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <ErrorState
      title="Your saved places didn't load"
      description="We couldn't load your saved places. Check your connection and try again."
      reference={digest}
      onRetry={retry}
    />
  );
}
