"use client";

import { Archive, CalendarCheck, CircleAlert, ExternalLink, Loader2, Pause, Pencil, Play, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { dynamicRoutes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { confirmListingAction, setListingStatusAction, submitForReviewAction } from "../actions";
import { MISSING_ITEMS, missingItemLabel, type EditorTab, type ListingStatus } from "../schemas";

type ListingRef = { id: string; slug: string; status: ListingStatus; title: string };

/** "What still needs doing" after submit_property_for_review returned missing items. */
export function MissingChecklist({ propertyId, missing, onNavigate }: { propertyId: string; missing: string[]; onNavigate?: (tab: EditorTab) => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-warning/40 bg-warning-surface p-4 text-warning-foreground">
      <p className="flex items-center gap-2 font-semibold">
        <CircleAlert className="size-4 shrink-0" aria-hidden />
        Almost there. Add these, then submit again:
      </p>
      <ul className="mt-3 space-y-1.5" aria-label="Missing items">
        {missing.map((code) => {
          const tab = (MISSING_ITEMS as Record<string, { tab: EditorTab }>)[code]?.tab;
          const href = withQuery(dynamicRoutes.ownerProperty(propertyId), { tab });
          return (
            <li key={code} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="size-4 shrink-0 rounded border border-warning-foreground/60" />
              {tab ? (
                onNavigate ? (
                  <button type="button" className="text-left font-medium underline underline-offset-4" onClick={() => onNavigate(tab)}>
                    {missingItemLabel(code)}
                  </button>
                ) : (
                  <Link href={href} className="font-medium underline underline-offset-4">
                    {missingItemLabel(code)}
                  </Link>
                )
              ) : (
                <span className="font-medium">{missingItemLabel(code)}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Lifecycle buttons for one listing. Which buttons show follows the lifecycle in spec 6.2; the
 * SQL functions enforce it regardless of what the browser asks for.
 */
export function ListingActions({
  listing,
  showEdit = false,
  onNavigate,
}: {
  listing: ListingRef;
  showEdit?: boolean;
  onNavigate?: (tab: EditorTab) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[] | null>(null);
  const { status } = listing;

  function run(key: string, task: () => Promise<boolean>) {
    setBusy(key);
    startTransition(async () => {
      const ok = await task();
      setBusy(null);
      if (ok) router.refresh();
    });
  }

  function submit() {
    run("submit", async () => {
      const result = await submitForReviewAction({ property_id: listing.id });
      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      if (!result.data.submitted) {
        setMissing(result.data.missing);
        return false;
      }
      setMissing(null);
      toast.success("Submitted for review. We will let you know when it is live.");
      return true;
    });
  }

  function setStatus(next: "published" | "paused" | "archived", message: string) {
    return async () => {
      const result = await setListingStatusAction({ property_id: listing.id, status: next });
      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      toast.success(message);
      return true;
    };
  }

  const spinner = (key: string) =>
    busy === key && pending ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {showEdit ? (
          <Link href={dynamicRoutes.ownerProperty(listing.id)} className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Pencil data-icon="inline-start" aria-hidden />
            Edit
          </Link>
        ) : null}
        {status === "draft" || status === "rejected" ? (
          <Button size="lg" onClick={submit} disabled={pending}>
            {spinner("submit") ?? <Send data-icon="inline-start" aria-hidden />}
            {status === "rejected" ? "Resubmit for review" : "Submit for review"}
          </Button>
        ) : null}
        {status === "published" ? (
          <Button variant="outline" size="lg" onClick={() => run("pause", setStatus("paused", "Listing paused. It is hidden from search."))} disabled={pending}>
            {spinner("pause") ?? <Pause data-icon="inline-start" aria-hidden />}
            Pause
          </Button>
        ) : null}
        {status === "paused" ? (
          <Button size="lg" onClick={() => run("resume", setStatus("published", "Listing is live again."))} disabled={pending}>
            {spinner("resume") ?? <Play data-icon="inline-start" aria-hidden />}
            Resume
          </Button>
        ) : null}
        {status === "published" || status === "paused" ? (
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() =>
              run("confirm", async () => {
                const result = await confirmListingAction({ property_id: listing.id });
                if (!result.ok) {
                  toast.error(result.error.message);
                  return false;
                }
                toast.success("Thanks. Your listing shows as recently confirmed.");
                return true;
              })
            }
          >
            {spinner("confirm") ?? <CalendarCheck data-icon="inline-start" aria-hidden />}
            Confirm still accurate
          </Button>
        ) : null}
        {status === "published" ? (
          <Link href={dynamicRoutes.property(listing.slug)} className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
            <ExternalLink data-icon="inline-start" aria-hidden />
            View live
          </Link>
        ) : null}
        {status !== "archived" ? (
          <ConfirmDialog
            title={`Archive “${listing.title}”?`}
            description="Archived listings are hidden for good and cannot be published again. To take it down for a while, pause it instead."
            confirmLabel="Archive listing"
            destructive
            onConfirm={async () => {
              const result = await setListingStatusAction({ property_id: listing.id, status: "archived" });
              if (!result.ok) throw new Error(result.error.message);
              toast.success("Listing archived.");
              router.refresh();
            }}
            trigger={
              <Button variant="ghost" size="lg" disabled={pending}>
                <Archive data-icon="inline-start" aria-hidden />
                Archive
              </Button>
            }
          />
        ) : null}
      </div>
      {missing && missing.length > 0 ? <MissingChecklist propertyId={listing.id} missing={missing} onNavigate={onNavigate} /> : null}
    </div>
  );
}
