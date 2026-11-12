"use client";

import { Flag, Heart, MessageCircle, RotateCw, UserRoundPen, Users, X } from "lucide-react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportDialog } from "@/features/moderation/components/report-dialog";
import { apiFetch, isApiError } from "@/lib/api/client";
import { dynamicRoutes, routes } from "@/lib/navigation";

import type { DeckCandidate, SwipeResult } from "../schemas";
import { CandidateCard } from "./candidate-card";

type Decision = "like" | "pass";
type DeckResponse = { state: string; candidates?: DeckCandidate[] };

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function SwipeCard({
  candidate,
  draggable,
  reduceMotion,
  onDecide,
}: {
  candidate: DeckCandidate;
  draggable: boolean;
  reduceMotion: boolean;
  onDecide: (decision: Decision) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], reduceMotion ? [0, 0] : [-12, 12]);
  const likeOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onDecide("like");
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onDecide("pass");
  }

  return (
    <motion.div
      className="absolute inset-0 touch-pan-y"
      style={{ x, rotate }}
      drag={draggable && !reduceMotion ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      initial={reduceMotion ? { opacity: 0 } : { scale: 0.96, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.12 } }
          : { opacity: 0, transition: { duration: 0.22 } }
      }
      transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <CandidateCard candidate={candidate} />
      {!reduceMotion ? (
        <>
          <motion.span
            style={{ opacity: likeOpacity }}
            className="pointer-events-none absolute top-6 left-6 -rotate-12 rounded-xl border-4 border-lime bg-ink/70 px-3 py-1 text-2xl font-extrabold text-lime"
            aria-hidden
          >
            LIKE
          </motion.span>
          <motion.span
            style={{ opacity: passOpacity }}
            className="pointer-events-none absolute top-6 right-6 rotate-12 rounded-xl border-4 border-coral bg-ink/70 px-3 py-1 text-2xl font-extrabold text-coral"
            aria-hidden
          >
            NOPE
          </motion.span>
        </>
      ) : null}
    </motion.div>
  );
}

export function SwipeDeck({ initial, city }: { initial: DeckCandidate[]; city: string | null }) {
  const reduceMotion = useReducedMotion() ?? false;
  const [queue, setQueue] = useState<DeckCandidate[]>(initial);
  const [match, setMatch] = useState<{ name: string; conversation_id: string | null } | null>(null);
  const [reporting, setReporting] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initial.length === 0);
  const [announcement, setAnnouncement] = useState("");
  const seen = useRef(new Set(initial.map((c) => c.user_id)));
  const pending = useRef(0);

  const refill = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const deck = await apiFetch<DeckResponse>("/roommates/candidates", { query: { limit: 20 } });
      const fresh = (deck.candidates ?? []).filter((c) => !seen.current.has(c.user_id));
      for (const c of fresh) seen.current.add(c.user_id);
      if (fresh.length === 0) setExhausted(true);
      setQueue((current) => [...current, ...fresh]);
    } catch {
      // The current cards still work; the empty state offers a retry.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  const decide = useCallback(
    async (decision: Decision) => {
      const top = queue[0];
      if (!top || match || reporting) return;
      setQueue((current) => current.slice(1));
      setAnnouncement(`${decision === "like" ? "Liked" : "Passed on"} ${top.display_name}.`);
      if (queue.length <= 4 && !exhausted) void refill();
      pending.current += 1;
      try {
        const result = await apiFetch<SwipeResult>("/roommates/swipes", {
          method: "POST",
          body: { target_id: top.user_id, action: decision },
        });
        if (decision === "like" && result.matched) {
          setMatch({ name: top.display_name, conversation_id: result.conversation_id });
        }
      } catch (error) {
        const gone = isApiError(error) && error.code === "not_found";
        toast.error(isApiError(error) ? error.message : "That swipe did not go through. Try again.");
        if (!gone) setQueue((current) => [top, ...current]);
      } finally {
        pending.current -= 1;
      }
    },
    [queue, match, reporting, exhausted, refill],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        void decide("like");
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        void decide("pass");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const top = queue[0];

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {top ? (
        <>
          <div className="relative h-[min(68dvh,620px)] min-h-[440px]">
            {queue[1] ? (
              <div className="absolute inset-0 translate-y-2 scale-[0.97] opacity-60" aria-hidden>
                <CandidateCard candidate={queue[1]} />
              </div>
            ) : null}
            <AnimatePresence initial={false}>
              <SwipeCard key={top.user_id} candidate={top} draggable reduceMotion={reduceMotion} onDecide={(d) => void decide(d)} />
            </AnimatePresence>
          </div>
          <div className="mt-5 flex items-center justify-center gap-5">
            <Button
              variant="outline"
              size="icon-lg"
              className="size-16 border-2 [&_svg:not([class*='size-'])]:size-7"
              aria-label={`Pass on ${top.display_name} (left arrow)`}
              onClick={() => void decide("pass")}
            >
              <X aria-hidden />
            </Button>
            <Button
              variant="accent"
              size="icon-lg"
              className="size-16 [&_svg:not([class*='size-'])]:size-7"
              aria-label={`Like ${top.display_name} (right arrow)`}
              onClick={() => void decide("like")}
            >
              <Heart aria-hidden />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Tip: use ← and → keys</span>
            <button
              type="button"
              className="inline-flex min-h-11 items-center gap-1 font-medium hover:text-foreground"
              onClick={() => setReporting(true)}
            >
              <Flag className="size-3.5" aria-hidden /> Report profile
            </button>
          </div>
          <ReportDialog
            subject={{ kind: "target", target_type: "roommate_profile", target_id: top.user_id }}
            title={`Report ${top.display_name}`}
            open={reporting}
            onOpenChange={setReporting}
            onReported={() => setQueue((current) => current.filter((c) => c.user_id !== top.user_id))}
          />
        </>
      ) : (
        <EmptyState
          icon={Users}
          title={loadingMore ? "Finding more people…" : "You're all caught up"}
          description={`You have seen everyone who matches your preferences${city ? ` in ${city}` : ""} for now. New people join every day.`}
          action={
            <>
              <Button variant="outline" size="lg" onClick={() => void refill()} disabled={loadingMore}>
                <RotateCw data-icon="inline-start" aria-hidden /> Check again
              </Button>
              <Link href={routes.roommateMatches} className={buttonVariants({ size: "lg" })}>
                <Heart data-icon="inline-start" aria-hidden /> Your matches
              </Link>
              <Link href={routes.roommateProfile} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                <UserRoundPen data-icon="inline-start" aria-hidden /> Edit preferences
              </Link>
            </>
          }
        />
      )}

      <Dialog open={match !== null} onOpenChange={(open) => (open ? null : setMatch(null))}>
        <DialogContent className="text-center">
          <DialogHeader className="items-center text-center">
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-lime text-ink">
              <Heart className="size-8" aria-hidden />
            </span>
            <DialogTitle className="text-2xl font-extrabold">It&apos;s a match!</DialogTitle>
            <DialogDescription>
              You and {match?.name} liked each other. Say hi and get to know each other. A match is not a booking.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <Button variant="outline" size="lg" onClick={() => setMatch(null)}>
              Keep swiping
            </Button>
            {match?.conversation_id ? (
              <Link href={dynamicRoutes.conversation(match.conversation_id)} className={buttonVariants({ size: "lg" })}>
                <MessageCircle data-icon="inline-start" aria-hidden /> Send a message
              </Link>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
