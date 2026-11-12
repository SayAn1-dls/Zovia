"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/feedback/error-state";

export default function AdminError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title="This page did not load"
      description="Something went wrong while loading admin data. Try again; if it keeps happening, check the server logs with the reference."
      reference={digest}
      onRetry={retry}
    />
  );
}
