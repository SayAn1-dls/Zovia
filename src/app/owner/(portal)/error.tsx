"use client";

import { SegmentError } from "@/features/owner/components/segment-error";

export default function OwnerError({ error, retry }: { error: unknown; retry: () => void }) {
  return <SegmentError error={error} retry={retry} />;
}
