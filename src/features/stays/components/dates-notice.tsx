"use client";

import { Info, X } from "lucide-react";

/** "Your dates were updated to ..." when a shared link's dates had to be replaced. Dismissible. */
export function DatesNotice({ text, onDismiss }: { text: string | null; onDismiss: () => void }) {
  if (!text) return null;
  return (
    <div role="status" className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="min-w-0 flex-1">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
}
