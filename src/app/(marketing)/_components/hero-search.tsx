"use client";

import { ChevronDown, Search } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { formatINRCompact } from "@/lib/format";
import { searchHref } from "@/lib/navigation";
import { launchCities } from "@/lib/site";
import { cn } from "@/lib/utils";

/** Monthly budget bands (integer INR). Labels are derived, not hand-typed. */
const budgetBands = [
  { id: "under-8k", budget_min: null, budget_max: 8000 },
  { id: "8k-15k", budget_min: 8000, budget_max: 15000 },
  { id: "15k-25k", budget_min: 15000, budget_max: 25000 },
  { id: "25k-plus", budget_min: 25000, budget_max: null },
] as const;

function bandLabel(band: (typeof budgetBands)[number]): string {
  if (band.budget_min === null) return `Under ${formatINRCompact(band.budget_max)}`;
  if (band.budget_max === null) return `${formatINRCompact(band.budget_min)}+`;
  return `${formatINRCompact(band.budget_min)}–${formatINRCompact(band.budget_max).replace("₹", "")}`;
}

/**
 * Hero search bar: pick a city and (optionally) a monthly budget, then go to
 * /search with those filters in the URL. The submit control is a real link,
 * so it can be opened in a new tab and works with assistive tech.
 */
export function HeroSearch() {
  const cityId = useId();
  const [city, setCity] = useState("");
  const [bandId, setBandId] = useState<string | null>(null);
  const band = budgetBands.find((entry) => entry.id === bandId);

  const href = searchHref({
    city: city || null,
    budget_min: band?.budget_min ?? null,
    budget_max: band?.budget_max ?? null,
  });

  return (
    <div className="rounded-3xl bg-card p-2.5 shadow-xl sm:p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor={cityId} className="sr-only">
            City
          </label>
          <select
            id={cityId}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={cn(
              "h-13 w-full cursor-pointer appearance-none rounded-2xl bg-muted pr-11 pl-4 text-base font-medium outline-none transition-colors duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring",
              city === "" && "text-muted-foreground",
            )}
          >
            <option value="">Any city</option>
            {launchCities.map((entry) => (
              <option key={entry.slug} value={entry.slug}>
                {entry.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted-foreground"
          />
        </div>
        <Link href={href} className={cn(buttonVariants({ size: "xl" }), "rounded-2xl sm:px-8")}>
          <Search aria-hidden />
          Search
        </Link>
      </div>

      <fieldset className="mt-2">
        <legend className="sr-only">Monthly budget</legend>
        <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2">
          {budgetBands.map((entry) => {
            const selected = entry.id === bandId;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setBandId(selected ? null : entry.id)}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center justify-center rounded-full border text-[0.8125rem] font-semibold whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] sm:px-4 sm:text-sm",
                  selected
                    ? "border-ink bg-lime text-ink"
                    : "border-border bg-card text-foreground hover:border-foreground",
                )}
              >
                {bandLabel(entry)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
