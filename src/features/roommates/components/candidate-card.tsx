"use client";

import { Briefcase, CalendarDays, MapPin, Wallet } from "lucide-react";

import { formatDate, formatINRRange } from "@/lib/format";

import { OCCUPATION_LABELS, type PublicRoommateCard } from "../schemas";

export function scoreTone(score: number): string {
  if (score >= 80) return "bg-lime text-ink";
  if (score >= 60) return "bg-success-surface text-success-foreground";
  if (score >= 40) return "bg-warning-surface text-warning-foreground";
  return "bg-muted text-foreground";
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
