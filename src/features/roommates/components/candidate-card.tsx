"use client";

import { Briefcase, CalendarDays, Home, MapPin, Sparkles, TriangleAlert, Wallet } from "lucide-react";
import { useState } from "react";

import { formatDate, formatINR, formatINRRange, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import { GENDER_LABELS, OCCUPATION_LABELS, type DeckCandidate, type PublicRoommateCard } from "../schemas";

export function scoreTone(score: number): string {
  if (score >= 80) return "bg-lime text-ink";
  if (score >= 60) return "bg-success-surface text-success-foreground";
  if (score >= 40) return "bg-warning-surface text-warning-foreground";
  return "bg-muted text-foreground";
}

function PhotoStrip({ person }: { person: PublicRoommateCard }) {
  const [index, setIndex] = useState(0);
  const count = person.photo_urls.length;
  const url = person.photo_urls[Math.min(index, count - 1)];
  if (!url) {
    return (
      <div className="flex size-full items-center justify-center bg-gradient-to-br from-lime/60 to-paper">
        <span className="font-heading text-6xl font-extrabold text-ink/70" aria-hidden>
          {initials(person.display_name)}
        </span>
      </div>
    );
  }
  return (
    <div className="relative size-full">
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
            className="absolute inset-y-0 left-0 w-1/3"
            aria-label="Previous photo"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 w-1/3"
            aria-label="Next photo"
            onClick={() => setIndex((i) => Math.min(count - 1, i + 1))}
          />
        </>
      ) : null}
    </div>
  );
}

/** Facts shared by the deck card and the match list. */
export function PersonFacts({ person }: { person: PublicRoommateCard }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
      {person.occupation ? (
        <li className="flex items-center gap-1.5">
          <Briefcase className="size-4" aria-hidden />
          {OCCUPATION_LABELS[person.occupation]}
          {person.occupation_detail ? ` · ${person.occupation_detail}` : ""}
        </li>
      ) : null}
      {person.budget_min !== null || person.budget_max !== null ? (
        <li className="flex items-center gap-1.5">
          <Wallet className="size-4" aria-hidden />
          {formatINRRange(person.budget_min, person.budget_max)} / month
        </li>
      ) : null}
      {person.city ? (
        <li className="flex items-center gap-1.5">
          <MapPin className="size-4" aria-hidden />
          {person.preferred_localities.length > 0
            ? `${person.preferred_localities.slice(0, 3).join(", ")} · ${person.city}`
            : person.city}
        </li>
      ) : null}
      {person.move_in_date ? (
        <li className="flex items-center gap-1.5">
          <CalendarDays className="size-4" aria-hidden />
          Moving {formatDate(person.move_in_date)}
        </li>
      ) : null}
    </ul>
  );
}

export function CandidateCard({ candidate }: { candidate: DeckCandidate }) {
  const { compatibility } = candidate;
  return (
    <article
      className="flex h-full flex-col overflow-hidden rounded-3xl bg-card shadow-lg ring-1 ring-border"
      aria-label={`${candidate.display_name}, ${compatibility.insufficient_data ? "compatibility unknown" : `${compatibility.score}% compatible`}`}
    >
      <div className="relative aspect-[4/3] w-full shrink-0 bg-muted sm:aspect-[16/10]">
        <PhotoStrip person={candidate} />
        <span
          className={cn(
            "absolute bottom-3 left-3 rounded-full px-3 py-1 text-sm font-bold shadow-md",
            scoreTone(compatibility.score),
          )}
        >
          {compatibility.insufficient_data ? "New here" : `${compatibility.score}% match`}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {candidate.display_name}
            {candidate.age ? <span className="font-medium text-muted-foreground">, {candidate.age}</span> : null}
            {candidate.gender && candidate.gender !== "prefer_not_to_say" ? (
              <span className="ml-2 align-middle text-xs font-medium text-muted-foreground">
                {GENDER_LABELS[candidate.gender]}
              </span>
            ) : null}
          </h2>
          {candidate.headline ? <p className="mt-1 text-[0.9375rem] font-medium">{candidate.headline}</p> : null}
        </div>
        <PersonFacts person={candidate} />
        <p className="text-sm leading-relaxed">{compatibility.explanation}</p>
        {compatibility.shared.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <Sparkles className="size-3.5" aria-hidden /> In common
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {compatibility.shared.map((item) => (
                <li key={item} className="rounded-full bg-success-surface px-3 py-1 text-xs font-medium text-success-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {compatibility.conflicts.length > 0 ? (
          <div>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <TriangleAlert className="size-3.5" aria-hidden /> Talk about
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {compatibility.conflicts.map((item) => (
                <li key={item} className="rounded-full bg-warning-surface px-3 py-1 text-xs font-medium text-warning-foreground">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {candidate.about ? <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{candidate.about}</p> : null}
        {candidate.has_place && candidate.place ? (
          <div className="rounded-2xl bg-muted p-4 text-sm">
            <p className="flex items-center gap-1.5 font-semibold">
              <Home className="size-4" aria-hidden /> Has a place: {candidate.place.title}
            </p>
            <p className="mt-1 text-muted-foreground">
              {[
                candidate.place.locality,
                candidate.place.rent_share !== null ? `${formatINR(candidate.place.rent_share)} / month share` : null,
                candidate.place.available_from ? `from ${formatDate(candidate.place.available_from)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : null}
      </div>
    </article>
  );
}
