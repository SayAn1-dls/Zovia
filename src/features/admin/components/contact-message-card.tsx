"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

import { updateContactMessageAction } from "../actions";
import { CONTACT_STATUS_LABELS, CONTACT_STATUSES, type AdminContactMessage, type ContactStatus } from "../schemas";

const TONES = { new: "brand", in_progress: "info", resolved: "success", spam: "danger" } as const;

export function ContactMessageCard({ message }: { message: AdminContactMessage }) {
  const router = useRouter();
  const [status, setStatus] = useState<ContactStatus>(message.status);
  const [note, setNote] = useState(message.staff_note ?? "");
  const [pending, startTransition] = useTransition();
  const dirty = status !== message.status || note !== (message.staff_note ?? "");

  function save() {
    startTransition(async () => {
      const result = await updateContactMessageAction({ id: message.id, status, staff_note: note });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success("Message updated");
      router.refresh();
    });
  }

  return (
    <li className="space-y-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold break-words">{message.subject}</p>
        <StatusBadge status={message.status} label={CONTACT_STATUS_LABELS[message.status]} tone={TONES[message.status]} />
      </div>
      <p className="text-sm break-words text-muted-foreground">
        {message.name} · <a className="underline underline-offset-4" href={`mailto:${message.email}`}>{message.email}</a>
        {message.phone ? ` · ${message.phone}` : ""} · {formatDateTime(message.created_at)}
      </p>
      <p className="text-[0.9375rem] break-words whitespace-pre-line">{message.message}</p>
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ContactStatus)}
            className="h-11 rounded-xl border border-input bg-card px-3 text-base md:text-[0.9375rem]"
          >
            {CONTACT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {CONTACT_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Staff note
          <Textarea rows={1} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button size="lg" onClick={save} disabled={!dirty || pending}>
          {pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <Save data-icon="inline-start" aria-hidden />}
          Save
        </Button>
      </div>
    </li>
  );
}
