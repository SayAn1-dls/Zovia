"use client";

import { useState } from "react";

import type { DirectoryCard as DirectoryCardData } from "../directory";
import { DirectoryCard } from "./directory-card";

/** The directory grid. Cards someone reported (or that vanished) drop out until the next load. */
export function DirectoryGrid({ items, canLike }: { items: DirectoryCardData[]; canLike: boolean }) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = items.filter((item) => !hidden.has(item.user_id));
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {visible.map((person) => (
        <li key={person.user_id} className="min-w-0">
          <DirectoryCard
            person={person}
            canLike={canLike}
            onHidden={(userId) => setHidden((current) => new Set(current).add(userId))}
          />
        </li>
      ))}
    </ul>
  );
}
