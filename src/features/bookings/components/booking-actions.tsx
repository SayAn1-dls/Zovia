"use client";

import { Check, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, isApiError } from "@/lib/api/client";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, { method: "POST", body });
      router.refresh();
    } catch (thrown) {
      setError(isApiError(thrown) ? thrown.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

/** Seeker or owner cancels a booking that is not paid yet. */
export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const { busy, error, run } = useAction();
  return (
    <div className="space-y-2">
      {error ? <FormMessage tone="danger">{error}</FormMessage> : null}
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={busy}
        onClick={() => {
          if (window.confirm("Cancel this booking request?")) void run(`/bookings/${bookingId}/cancel`, {});
        }}
      >
        {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <X data-icon="inline-start" aria-hidden />}
        Cancel request
      </Button>
    </div>
  );
}

/** Owner accepts or declines a request. */
export function RespondBookingButtons({ bookingId }: { bookingId: string }) {
  const { busy, error, run } = useAction();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-2">
      {error ? <FormMessage tone="danger">{error}</FormMessage> : null}
      {declining ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input aria-label="Reason for declining" placeholder="Reason, e.g. bed no longer free" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} />
          <Button type="button" variant="destructive" size="lg" disabled={busy || reason.trim().length < 3} onClick={() => void run(`/bookings/${bookingId}/respond`, { accept: false, reason })}>
            Decline
          </Button>
          <Button type="button" variant="ghost" size="lg" onClick={() => setDeclining(false)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="lg" disabled={busy} onClick={() => void run(`/bookings/${bookingId}/respond`, { accept: true })}>
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Check data-icon="inline-start" aria-hidden />}
            Accept
          </Button>
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={() => setDeclining(true)}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}
