"use client";

import { catchError, type ErrorInfo } from "next/error";

import { ErrorState } from "@/components/feedback/error-state";

function SectionError(props: { title?: string; description?: string }, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <ErrorState
      title={props.title ?? "This didn't load"}
      description={props.description ?? "Check your connection and try again."}
      reference={digest}
      onRetry={() => retry()}
    />
  );
}

/** Error boundary for one section of a page (Next.js `catchError`): the rest of the page keeps working. */
export const SectionErrorBoundary = catchError(SectionError);
