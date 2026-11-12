"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { FieldError } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { reviewListingAction } from "../actions";
import type { ListingStatus } from "../schemas";

/**
 * Approve (pending_review -> published) or reject with a reason the owner sees. Rejecting is
 * also possible for a published listing (staff take-down). admin_review_property() enforces both.
 */
export function ReviewDecision({ propertyId, status }: { propertyId: string; status: ListingStatus }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);

  if (status !== "pending_review" && status !== "published") {
    return <p className="text-sm text-muted-foreground">No review decision is possible for a listing in this state.</p>;
  }

  function decide(approve: boolean) {
    setError(null);
    if (!approve && reason.trim().length < 5) {
      setError("Tell the owner what to change (at least 5 characters).");
      return;
    }
    setBusy(approve ? "approve" : "reject");
    startTransition(async () => {
      const result = await reviewListingAction({ property_id: propertyId, approve, reason: approve ? undefined : reason });
      setBusy(null);
      if (!result.ok) {
        const details = result.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        setError(details?.fieldErrors?.reason?.[0] ?? result.error.message);
        return;
      }
      toast.success(approve ? "Approved. The listing is live." : "Rejected. The owner has been notified.");
      setRejecting(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {status === "pending_review" ? (
          <Button size="lg" onClick={() => decide(true)} disabled={pending}>
            {busy === "approve" ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Check data-icon="inline-start" aria-hidden />}
            Approve and publish
          </Button>
        ) : null}
        {!rejecting ? (
          <Button variant="outline" size="lg" onClick={() => setRejecting(true)} disabled={pending}>
            <X data-icon="inline-start" aria-hidden />
            {status === "published" ? "Take down (reject)" : "Reject"}
          </Button>
        ) : null}
      </div>
      {rejecting ? (
        <div className="space-y-3 rounded-2xl bg-muted/60 p-4">
          <label className="flex flex-col gap-1.5 text-sm font-semibold" htmlFor="reject-reason">
            Reason for the owner
          </label>
          <Textarea
            id="reject-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={Boolean(error)}
            placeholder="e.g. The photos do not show the rooms. Add photos of each room."
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" size="lg" onClick={() => decide(false)} disabled={pending}>
              {busy === "reject" ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null}
              Send rejection
            </Button>
            <Button variant="ghost" size="lg" onClick={() => setRejecting(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
        </div>
      ) : error ? (
        <FieldError>{error}</FieldError>
      ) : null}
    </div>
  );
}
