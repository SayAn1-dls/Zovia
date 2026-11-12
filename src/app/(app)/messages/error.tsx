"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";

export default function MessagesError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  useEffect(() => console.error(error), [error]);
  return (
    <ErrorState
      title="Messages did not load"
      description="We could not load this page. Check your connection and try again."
      reference={digest}
      onRetry={retry}
    />
  );
}
