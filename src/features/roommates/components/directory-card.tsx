"use client";

import { CalendarDays, Check, Flag, Heart, Loader2, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { apiFetch, isApiError } from "@/lib/api/client";
import { formatDate, formatINRRange, initials } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";

import type { DirectoryCard as DirectoryCardData } from "../directory";
import { GENDER_LABELS, type SwipeResult } from "../schemas";

/**
 * One person in the roommate directory. Contact never starts here: Like is the same swipe the deck
 * sends, so a chat opens only when both people like each other. Report works from the card.
 */
export function DirectoryCard({
  person,
  canLike,
  onHidden,
}: {
  person: DirectoryCardData;
  /** The viewer has a live roommate profile (swipes need one). */
  canLike: boolean;
  onHidden: (userId: string) => void;
}) {
  const router = useRouter();
  const [liking, setLiking] = useState(false);
  const [liked, setLiked] = useState(false);
  const [reporting, setReporting] = useState(false);
  const gender = person.gender && person.gender !== "prefer_not_to_say" ? GENDER_LABELS[person.gender] : null;

  async function like() {
    setLiking(true);
    try {
      const result = await apiFetch<SwipeResult>("/roommates/swipes", {
        method: "POST",
        body: { target_id: person.user_id, action: "like" },
      });
      setLiked(true);
      const conversationId = result.conversation_id;
      if (result.matched && conversationId) {
        toast.success(`It's a match with ${person.display_name}!`, {
          action: { label: "Say hi", onClick: () => router.push(dynamicRoutes.conversation(conversationId)) },
        });
      } else {
        toast.success(`Liked. If ${person.display_name} likes you back, a chat opens.`);
      }
    } catch (error) {
      toast.error(isApiError(error) ? error.message : "That like did not go through. Try again.");
      if (isApiError(error) && error.code === "not_found") onHidden(person.user_id);
    } finally {
      setLiking(false);
    }
  }

  return (
    <article
      className="flex flex-col overflow-hidden rounded-3xl bg-card ring-1 ring-border"
      aria-label={`${person.display_name}, ${person.available ? "available" : "not available"}`}
    >
      <div className="relative aspect-[4/3] w-full bg-muted">
        {person.photo_url ? (
          // Signed URL from a private bucket (short-lived), so next/image cannot cache it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo_url} alt={`Photo of ${person.display_name}`} className="size-full object-cover" loading="lazy" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="font-heading text-5xl font-extrabold text-foreground/40" aria-hidden>
              {initials(person.display_name)}
            </span>
          </div>
        )}
        <Badge variant={person.available ? "success" : "secondary"} className="absolute top-3 left-3 shadow-sm">
          {person.available ? "Available" : "Not available"}
        </Badge>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <h2 className="text-lg font-bold tracking-tight break-words">
          {person.display_name}
          {person.age ? <span className="font-medium text-muted-foreground">, {person.age}</span> : null}
          {gender ? <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">{gender}</span> : null}
        </h2>

        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {person.budget_min !== null || person.budget_max !== null ? (
            <li className="flex items-start gap-1.5">
              <Wallet className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{formatINRRange(person.budget_min, person.budget_max)} / month</span>
            </li>
          ) : null}
          {person.city ? (
            <li className="flex items-start gap-1.5">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">
                {person.preferred_localities.length > 0
                  ? `${person.preferred_localities.slice(0, 3).join(", ")} · ${person.city}`
                  : person.city}
              </span>
            </li>
          ) : null}
          {person.move_in_date ? (
            <li className="flex items-start gap-1.5">
              <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Moving {formatDate(person.move_in_date)}</span>
            </li>
          ) : null}
        </ul>

        {person.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Lifestyle">
            {person.tags.map((tag) => (
              <li key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {canLike ? (
            <Button onClick={like} disabled={liking || liked} aria-label={liked ? `Liked ${person.display_name}` : `Like ${person.display_name}`}>
              {liking ? (
                <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden />
              ) : liked ? (
                <Check data-icon="inline-start" aria-hidden />
              ) : (
                <Heart data-icon="inline-start" aria-hidden />
              )}
              {liked ? "Liked" : "Like"}
            </Button>
          ) : (
            <Link href={routes.roommateProfile} className={buttonVariants({ variant: "outline" })}>
              Go live to like
            </Link>
          )}
          <Button variant="ghost" onClick={() => setReporting(true)} aria-label={`Report ${person.display_name}`}>
            <Flag data-icon="inline-start" aria-hidden /> Report
          </Button>
        </div>
      </div>

      <ReportDialog
        subject={{ kind: "target", target_type: canLike ? "roommate_profile" : "user", target_id: person.user_id }}
        title={`Report ${person.display_name}`}
        open={reporting}
        onOpenChange={setReporting}
        onReported={() => onHidden(person.user_id)}
      />
    </article>
  );
}
