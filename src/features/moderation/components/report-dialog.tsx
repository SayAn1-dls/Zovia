"use client";

import { Flag, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, isApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import {
  MESSAGE_REPORT_REASONS,
  PERSON_REPORT_REASONS,
  REPORT_REASON_LABELS,
  type ReportReason,
  type ReportTarget,
} from "../schemas";

export type ReportSubject =
  | { kind: "message"; id: string }
  | { kind: "target"; target_type: Exclude<ReportTarget, "message">; target_id: string };

type ReportDialogProps = {
  subject: ReportSubject;
  /** e.g. "Report Asha" */
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported?: () => void;
};

/** Report a message, person or profile. Controlled: open it from a menu item or button. */
export function ReportDialog({ subject, title, open, onOpenChange, onReported }: ReportDialogProps) {
  const id = useId();
  const reasons: readonly ReportReason[] = subject.kind === "message" ? MESSAGE_REPORT_REASONS : PERSON_REPORT_REASONS;
  const [reason, setReason] = useState<ReportReason | "">("");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function change(next: boolean) {
    if (pending) return;
    if (next) {
      setReason("");
      setDetails("");
      setFailure(null);
    }
    onOpenChange(next);
  }

  async function submit() {
    if (!reason) {
      setFailure("Choose a reason.");
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      if (subject.kind === "message") {
        await apiFetch(`/messages/${subject.id}/report`, { method: "POST", body: { reason, details } });
      } else {
        await apiFetch("/reports", {
          method: "POST",
          body: { target_type: subject.target_type, target_id: subject.target_id, reason_code: reason, details },
        });
      }
      toast.success("Thanks. Our team will review this.");
      setPending(false);
      onOpenChange(false);
      onReported?.();
    } catch (error) {
      setPending(false);
      setFailure(isApiError(error) ? error.message : "That did not work. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Reports are private. The other person is not told who reported them.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-semibold">What is wrong?</legend>
          {reasons.map((value) => (
            <label
              key={value}
              className={cn(
                "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border px-3 text-sm font-medium transition-colors hover:border-foreground",
                reason === value && "border-foreground bg-muted",
              )}
            >
              <input
                type="radio"
                name={`${id}-reason`}
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                className="size-4 accent-[var(--ink)]"
              />
              {REPORT_REASON_LABELS[value]}
            </label>
          ))}
        </fieldset>
        <div className="space-y-2">
          <label htmlFor={`${id}-details`} className="text-sm font-semibold">
            Anything else? <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <Textarea
            id={`${id}-details`}
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </div>
        {failure ? <FormMessage tone="danger">{failure}</FormMessage> : null}
        <DialogFooter>
          <Button variant="outline" size="lg" onClick={() => change(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" size="lg" onClick={submit} disabled={pending}>
            {pending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
            ) : (
              <Flag data-icon="inline-start" aria-hidden />
            )}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
