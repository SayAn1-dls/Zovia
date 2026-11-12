"use client";

import { Flag, Heart, MapPin, MessageCircle, RotateCw, SlidersHorizontal, X } from "lucide-react";
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
import { RoommateCard, SWIPE_DISTANCE, SwipeStamps } from "./roommate-card";

type Decision = "like" | "pass";
type DeckResponse = { state: string; candidates?: DeckCandidate[] };

const SWIPE_VELOCITY = 600;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

const exitVariants = {
  exit: (direction: number) =>
    direction === 0
      ? { opacity: 0, transition: { duration: 0.15 } }
      : { x: direction * 520, rotate: direction * 24, opacity: 0, transition: { duration: 0.32, ease: [0.4, 0, 1, 1] as const } },
};

function SwipeCard({
  candidate,
  reduceMotion,
  expanded,
  onToggleExpanded,
  onDecide,
}: {
  candidate: DeckCandidate;
  reduceMotion: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onDecide: (decision: Decision) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], reduceMotion ? [0, 0] : [-14, 14]);
  const dragged = useRef(false);

  function onDragEnd(_: unknown, info: PanInfo) {
    // Swallow the click that follows a drag so it does not toggle the details sheet.
    window.setTimeout(() => (dragged.current = false), 0);
    if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY) onDecide("like");
    else if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY) onDecide("pass");
  }

  return (
    <motion.div
      className="absolute inset-0 z-10 cursor-grab touch-pan-y active:cursor-grabbing"
      style={{ x, rotate }}
      drag={reduceMotion ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragStart={() => (dragged.current = true)}
      onDragEnd={onDragEnd}
      onClickCapture={(event) => {
        if (dragged.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      variants={reduceMotion ? undefined : exitVariants}
      initial={reduceMotion ? { opacity: 0 } : { scale: 0.95, y: 14, opacity: 1 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : "exit"}
      transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <RoommateCard
        person={candidate}
        compatibility={candidate.compatibility}
        expanded={expanded}
        onToggleExpanded={onToggleExpanded}
        reduceMotion={reduceMotion}
      />
      {!reduceMotion ? <SwipeStamps x={x} /> : null}
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
  const [direction, setDirection] = useState(0);
  const [expanded, setExpanded] = useState(false);
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
      setDirection(decision === "like" ? 1 : -1);
      setExpanded(false);
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
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        setExpanded(event.key === "ArrowUp");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide]);

  const top = queue[0];
  const behind = queue.slice(1, 3);

  return (
    <div className="mx-auto w-full max-w-md">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {top ? (
        <>
          <div className="relative h-[min(62dvh,600px)] min-h-[420px]">
            {behind
              .map((candidate, index) => (
                <div
                  key={candidate.user_id}
                  className="absolute inset-0 transition-transform duration-300"
                  style={{ transform: `translateY(${(index + 1) * 12}px) scale(${1 - (index + 1) * 0.04})` }}
                  aria-hidden
                  inert
                >
                  <RoommateCard person={candidate} compatibility={candidate.compatibility} expanded={false} onToggleExpanded={() => {}} />
                </div>
              ))
              .reverse()}
            <AnimatePresence initial={false} custom={direction}>
              <SwipeCard
                key={top.user_id}
                candidate={top}
                reduceMotion={reduceMotion}
                expanded={expanded}
                onToggleExpanded={() => setExpanded((open) => !open)}
                onDecide={(d) => void decide(d)}
              />
            </AnimatePresence>
          </div>
          <div className="mt-6 flex items-center justify-center gap-8">
            <button
              type="button"
              className="flex size-16 items-center justify-center rounded-full bg-card text-coral shadow-lg ring-1 ring-border transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
              aria-label={`Pass on ${top.display_name} (left arrow)`}
              onClick={() => void decide("pass")}
            >
              <X className="size-8" strokeWidth={3} aria-hidden />
            </button>
            <button
              type="button"
              className="flex size-20 items-center justify-center rounded-full bg-lime text-ink shadow-lg ring-1 ring-ink/10 transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
              aria-label={`Like ${top.display_name} (right arrow)`}
              onClick={() => void decide("like")}
            >
              <Heart className="size-9 fill-current" aria-hidden />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="hidden sm:inline">Tip: ← pass, → like, ↑ details</span>
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
            onReported={() => {
              setDirection(0);
              setExpanded(false);
              setQueue((current) => current.filter((c) => c.user_id !== top.user_id));
            }}
          />
        </>
      ) : (
        <EmptyState
          icon={MapPin}
          title={loadingMore ? "Finding more people…" : `No one new in ${city ?? "your city"} yet`}
          description="You have seen everyone who fits your preferences for now. New people join every day, or widen your filters to see more."
          action={
            <>
              <Link href={routes.roommateProfile} className={buttonVariants({ size: "lg" })}>
                <SlidersHorizontal data-icon="inline-start" aria-hidden /> Edit filters
              </Link>
              <Button variant="outline" size="lg" onClick={() => void refill()} disabled={loadingMore}>
                <RotateCw data-icon="inline-start" aria-hidden /> Check again
              </Button>
              <Link href={routes.roommateMatches} className={buttonVariants({ variant: "ghost", size: "lg" })}>
                <Heart data-icon="inline-start" aria-hidden /> Your matches
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
