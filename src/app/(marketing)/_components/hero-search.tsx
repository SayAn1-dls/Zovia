"use client";

import { ChevronDown, MapPin, Search } from "lucide-react";
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
    <div className="rounded-3xl bg-white p-3 text-ink shadow-xl ring-1 ring-white/20 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor={cityId} className="sr-only">
            City
          </label>
          <MapPin
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-violet"
          />
          <select
            id={cityId}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={cn(
              "h-13 w-full cursor-pointer appearance-none rounded-2xl border border-[#868ba6] bg-white pr-11 pl-12 text-base font-medium outline-none transition-[border-color,box-shadow] duration-150 hover:border-ink/50 focus-visible:border-violet focus-visible:ring-3 focus-visible:ring-violet/25",
              city === "" && "text-[#565b73]",
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
            className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-[#565b73]"
          />
        </div>
        <Link href={href} className={cn(buttonVariants({ size: "xl" }), "sm:w-auto")}>
          <Search aria-hidden />
          Search homes
        </Link>
      </div>

      <fieldset className="mt-3">
        <legend className="sr-only">Monthly budget</legend>
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden className="mr-1 text-sm font-medium text-[#565b73]">
            Budget / month
          </span>
          {budgetBands.map((entry) => {
            const selected = entry.id === bandId;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setBandId(selected ? null : entry.id)}
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold tabular-nums transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-offset-2 active:scale-[0.97]",
                  selected
                    ? "border-ink bg-ink text-white"
                    : "border-[#e4e2ee] bg-[#f1f0f7] text-ink hover:border-violet/50 hover:bg-lavender",
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
