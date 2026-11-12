"use client";

import { Briefcase, ChevronDown, ChevronUp, Home, MapPin, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import { AnimatePresence, motion, useTransform, type MotionValue } from "motion/react";
import { useId, useState, type ReactNode } from "react";

import { formatDate, formatINR, formatINRRange, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { GENDER_LABELS, OCCUPATION_LABELS, type CompatibilitySummary, type PublicRoommateCard } from "../schemas";
import { PersonFacts, scoreTone } from "./candidate-card";

export const SWIPE_DISTANCE = 110;

function Photos({ person }: { person: PublicRoommateCard }) {
  const [index, setIndex] = useState(0);
  const count = person.photo_urls.length;
  const url = person.photo_urls[Math.min(index, count - 1)];
  if (!url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-ink pb-24">
        <span className="font-heading text-8xl font-extrabold text-lime" aria-hidden>
          {initials(person.display_name)}
        </span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0">
      {/* Signed URL from a private bucket (short-lived), so next/image cannot cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Photo of ${person.display_name}`} className="size-full object-cover" draggable={false} />
      {count > 1 ? (
        <>
          <div className="absolute inset-x-3 top-3 flex gap-1" aria-hidden>
            {person.photo_urls.map((photo, i) => (
              <span key={photo} className={cn("h-1 flex-1 rounded-full", i === index ? "bg-white" : "bg-white/40")} />
            ))}
          </div>
          <button
            type="button"
            className="absolute top-0 bottom-[40%] left-0 w-1/3"
            aria-label={`Previous photo (${index + 1} of ${count})`}
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <button
            type="button"
            className="absolute top-0 right-0 bottom-[40%] w-1/3"
            aria-label={`Next photo (${index + 1} of ${count})`}
            onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
          />
        </>
      ) : null}
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: typeof MapPin; children: ReactNode }) {
  return (
    <li className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </li>
  );
}

function ScorePill({ compatibility }: { compatibility: CompatibilitySummary | null }) {
  if (!compatibility) {
    return <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-ink shadow-md">Your card</span>;
  }
  return (
    <span className={cn("rounded-full px-3 py-1 text-sm font-bold shadow-md", scoreTone(compatibility.score))}>
      {compatibility.insufficient_data ? "New here" : `${compatibility.score}% match`}
    </span>
  );
}

function Pills({ items, tone }: { items: string[]; tone: "good" | "warn" }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            tone === "good" ? "bg-success-surface text-success-foreground" : "bg-warning-surface text-warning-foreground",
          )}
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Tinder-style roommate card: a full-height photo with the essentials over a dark scrim, and a
 * details sheet (compatibility, lifestyle overlap, about, place) that slides up on tap.
 * Purely presentational: the deck and the profile preview own the state.
 */
export function RoommateCard({
  person,
  compatibility,
  expanded,
  onToggleExpanded,
  reduceMotion = false,
}: {
  person: PublicRoommateCard;
  /** null on the owner's own preview (there is nobody to compare with). */
  compatibility: CompatibilitySummary | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  reduceMotion?: boolean;
}) {
  const detailsId = useId();
  const hasBudget = person.budget_min !== null || person.budget_max !== null;
  const scoreLabel = !compatibility
    ? "preview"
    : compatibility.insufficient_data
      ? "compatibility unknown"
      : `${compatibility.score}% compatible`;

  return (
    <article
      className="relative size-full overflow-hidden rounded-3xl bg-ink shadow-xl ring-1 ring-ink/10 select-none"
      aria-label={`${person.display_name}${person.age ? `, ${person.age}` : ""}, ${scoreLabel}`}
    >
      <Photos person={person} />
      {/* Scrim so white text stays readable on any photo. */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/90 via-black/50 to-transparent"
        aria-hidden
      />
      <div className="absolute top-4 right-4">
        <ScorePill compatibility={compatibility} />
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        aria-controls={detailsId}
        className="absolute inset-x-0 bottom-0 flex w-full items-end gap-3 p-5 text-left text-white outline-none focus-visible:ring-4 focus-visible:ring-lime focus-visible:ring-inset"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-heading text-3xl leading-tight font-extrabold">
            {person.display_name}
            {person.age ? <span className="font-semibold text-white/85">, {person.age}</span> : null}
          </span>
          {person.headline ? <span className="mt-1 line-clamp-2 block text-sm text-white/85">{person.headline}</span> : null}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {person.occupation ? <Chip icon={Briefcase}>{OCCUPATION_LABELS[person.occupation]}</Chip> : null}
            {person.city ? <Chip icon={MapPin}>{person.city}</Chip> : null}
            {hasBudget ? <Chip icon={Wallet}>{formatINRRange(person.budget_min, person.budget_max)}</Chip> : null}
          </ul>
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ink shadow-md" aria-hidden>
          <ChevronUp className="size-5" />
        </span>
        <span className="sr-only">Details</span>
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            id={detailsId}
            key="details"
            className="absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-3xl bg-card text-card-foreground shadow-2xl"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%" }}
            transition={{ duration: reduceMotion ? 0.1 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-start gap-3 border-b border-border p-5 pb-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold tracking-tight">
                  {person.display_name}
                  {person.age ? <span className="font-medium text-muted-foreground">, {person.age}</span> : null}
                </h2>
                {person.gender && person.gender !== "prefer_not_to_say" ? (
                  <p className="text-xs font-medium text-muted-foreground">{GENDER_LABELS[person.gender]}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onToggleExpanded}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted hover:bg-muted/70"
                aria-label="Hide details"
              >
                <ChevronDown className="size-5" aria-hidden />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-5">
              {person.headline ? <p className="text-[0.9375rem] font-medium">{person.headline}</p> : null}
              <PersonFacts person={person} />
              {compatibility ? (
                <>
                  <p className="text-sm leading-relaxed">{compatibility.explanation}</p>
                  {compatibility.shared.length > 0 ? (
                    <div>
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        <Sparkles className="size-3.5" aria-hidden /> Lifestyle in common
                      </h3>
                      <Pills items={compatibility.shared} tone="good" />
                    </div>
                  ) : null}
                  {compatibility.conflicts.length > 0 ? (
                    <div>
                      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        <TriangleAlert className="size-3.5" aria-hidden /> Worth talking about
                      </h3>
                      <Pills items={compatibility.conflicts} tone="warn" />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
                  Others also see your match score here, plus the lifestyle habits you share and the ones worth talking about.
                </p>
              )}
              {person.about ? <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{person.about}</p> : null}
              {person.has_place && person.place ? (
                <div className="rounded-2xl bg-muted p-4 text-sm">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Home className="size-4" aria-hidden /> Has a place: {person.place.title}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {[
                      person.place.locality,
                      person.place.rent_share !== null ? `${formatINR(person.place.rent_share)} / month share` : null,
                      person.place.available_from ? `from ${formatDate(person.place.available_from)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

/** LIKE / NOPE stamps that fade in with the horizontal drag offset. */
export function SwipeStamps({ x }: { x: MotionValue<number> }) {
  const likeOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const passOpacity = useTransform(x, [-SWIPE_DISTANCE, -30], [1, 0]);
  return (
    <>
      <motion.span
        style={{ opacity: likeOpacity }}
        className="pointer-events-none absolute top-16 left-6 -rotate-12 rounded-xl border-4 border-lime px-3 py-0.5 font-heading text-4xl font-extrabold tracking-wider text-lime"
        aria-hidden
      >
        LIKE
      </motion.span>
      <motion.span
        style={{ opacity: passOpacity }}
        className="pointer-events-none absolute top-16 right-6 rotate-12 rounded-xl border-4 border-coral px-3 py-0.5 font-heading text-4xl font-extrabold tracking-wider text-coral"
        aria-hidden
      >
        NOPE
      </motion.span>
    </>
  );
}
