"use client";

import { Loader2, LocateFixed, Search, SlidersHorizontal, X } from "lucide-react";
import {
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs";
import { type FormEvent, useId, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

import {
  FURNISHING_LABELS,
  FURNISHINGS,
  GENDER_FILTER_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_TYPES,
  SORT_LABELS,
  SORTS,
  type AmenityOption,
  type CityOption,
  type Furnishing,
  type PropertyType,
} from "../schemas";
import { NativeSelect } from "./native-select";
import { useSearchTransition } from "./search-transition";

/** URL state of /search (nuqs). Names and formats match `parseSearchFilters` on the server. */
const searchParsers = {
  city: parseAsString,
  q: parseAsString,
  type: parseAsNativeArrayOf(parseAsStringLiteral(PROPERTY_TYPES)),
  budget_min: parseAsInteger,
  budget_max: parseAsInteger,
  gender: parseAsStringLiteral(["male", "female"] as const),
  food: parseAsBoolean,
  amenities: parseAsNativeArrayOf(parseAsString),
  furnishing: parseAsStringLiteral(FURNISHINGS),
  available_only: parseAsBoolean,
  sort: parseAsStringLiteral(SORTS).withDefault("relevance"),
  page: parseAsInteger.withDefault(1),
  lat: parseAsFloat,
  lng: parseAsFloat,
};

/** Amenities offered as quick filters, in this order (codes from the `amenities` table). */
const FEATURED_AMENITIES = ["wifi", "ac", "attached_bathroom", "laundry", "parking", "food", "power_backup", "housekeeping"];

const BUDGET_PRESETS = [
  { min: null, max: 8000 },
  { min: 8000, max: 15000 },
  { min: 15000, max: 25000 },
  { min: 25000, max: null },
] as const;

function budgetPresetLabel(min: number | null, max: number | null): string {
  if (min === null) return `Under ${formatINRCompact(max)}`;
  if (max === null) return `${formatINRCompact(min)}+`;
  return `${formatINRCompact(min)}–${formatINRCompact(max).replace("₹", "")}`;
}

type Draft = {
  type: PropertyType[];
  budget_min: string;
  budget_max: string;
  gender: "male" | "female" | null;
  food: boolean;
  amenities: string[];
  furnishing: Furnishing | null;
  available_only: boolean;
};

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function toInt(value: string): number | null {
  const n = Number(value.replace(/[,\s₹]/g, ""));
  return value.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors",
        selected ? "border-ink bg-ink text-white" : "border-foreground/20 bg-card hover:border-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Search controls: text, city and sort inline; everything else in a sheet (bottom on phones,
 * side on desktop) that applies on "Show results". Every change updates the URL and asks the
 * server for a new page inside one transition.
 */
export function SearchFilters({ cities, amenities }: { cities: CityOption[]; amenities: AmenityOption[] }) {
  const { isPending, startTransition } = useSearchTransition();
  const [filters, setFilters] = useQueryStates(searchParsers, {
    shallow: false,
    scroll: false,
    startTransition,
  });
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(filters.q ?? "");
  const [locating, setLocating] = useState(false);
  const ids = { q: useId(), city: useId(), sort: useId(), min: useId(), max: useId(), furnishing: useId() };

  const amenityOptions = FEATURED_AMENITIES.flatMap((code) => amenities.filter((a) => a.code === code));
  const draftFromUrl = (): Draft => ({
    type: [...filters.type],
    budget_min: filters.budget_min?.toString() ?? "",
    budget_max: filters.budget_max?.toString() ?? "",
    gender: filters.gender,
    food: filters.food ?? false,
    amenities: [...filters.amenities],
    furnishing: filters.furnishing,
    available_only: filters.available_only ?? false,
  });
  const [draft, setDraft] = useState<Draft>(draftFromUrl);

  const activeCount =
    filters.type.length +
    (filters.budget_min !== null || filters.budget_max !== null ? 1 : 0) +
    (filters.gender ? 1 : 0) +
    (filters.food ? 1 : 0) +
    filters.amenities.length +
    (filters.furnishing ? 1 : 0) +
    (filters.available_only ? 1 : 0);
  const hasPoint = filters.lat !== null && filters.lng !== null;

  function onSubmitText(event: FormEvent) {
    event.preventDefault();
    void setFilters({ q: q.trim() || null, page: null });
  }

  function openSheet(next: boolean) {
    if (next) setDraft(draftFromUrl());
    setOpen(next);
  }

  function applyDraft() {
    let min = toInt(draft.budget_min);
    let max = toInt(draft.budget_max);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    void setFilters({
      type: draft.type,
      budget_min: min,
      budget_max: max,
      gender: draft.gender,
      food: draft.food || null,
      amenities: draft.amenities,
      furnishing: draft.furnishing,
      available_only: draft.available_only || null,
      page: null,
    });
    setOpen(false);
  }

  function clearDraft() {
    setDraft({
      type: [],
      budget_min: "",
      budget_max: "",
      gender: null,
      food: false,
      amenities: [],
      furnishing: null,
      available_only: false,
    });
  }

  function nearMe() {
    if (hasPoint) {
      void setFilters({ lat: null, lng: null, sort: filters.sort === "distance" ? null : filters.sort, page: null });
      return;
    }
    if (!("geolocation" in navigator)) {
      toast.error("Your browser cannot share your location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const lat = Math.round(position.coords.latitude * 1e5) / 1e5;
        const lng = Math.round(position.coords.longitude * 1e5) / 1e5;
        if (lat < 6 || lat > 38 || lng < 68 || lng > 98) {
          toast.error("Zovia lists places in India only, and your location looks to be outside it.");
          return;
        }
        void setFilters({ lat, lng, sort: "distance", page: null });
      },
      () => {
        setLocating(false);
        toast.error("We could not get your location. Check the browser's permission and try again.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmitText} role="search" className="flex gap-2">
        <label htmlFor={ids.q} className="sr-only">
          Locality, PIN code, college or office
        </label>
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={ids.q}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Locality, PIN, college or office"
            enterKeyHint="search"
            maxLength={100}
            className="pl-10"
          />
        </div>
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          <span className="sr-only sm:not-sr-only">Search</span>
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[calc(50%-0.25rem)] sm:w-44">
          <label htmlFor={ids.city} className="sr-only">
            City
          </label>
          <NativeSelect
            id={ids.city}
            value={cities.find((c) => c.slug === filters.city?.toLowerCase() || c.name === filters.city)?.slug ?? ""}
            onChange={(event) => void setFilters({ city: event.target.value || null, page: null })}
          >
            <option value="">All cities</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="w-[calc(50%-0.25rem)] sm:w-48">
          <label htmlFor={ids.sort} className="sr-only">
            Sort by
          </label>
          <NativeSelect
            id={ids.sort}
            value={filters.sort}
            onChange={(event) =>
              void setFilters({ sort: event.target.value as (typeof SORTS)[number], page: null })
            }
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort} disabled={sort === "distance" && !hasPoint && !filters.city}>
                {SORT_LABELS[sort]}
                {sort === "distance" && !hasPoint ? (filters.city ? " (from city centre)" : " (choose a city)") : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button variant="outline" size="lg" onClick={() => openSheet(true)} aria-haspopup="dialog">
          <SlidersHorizontal aria-hidden />
          Filters
          {activeCount > 0 ? (
            <span className="ml-0.5 inline-flex size-5 items-center justify-center rounded-full bg-ink text-xs text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
        <Button variant={hasPoint ? "default" : "outline"} size="lg" onClick={nearMe} disabled={locating} aria-pressed={hasPoint}>
          {locating ? <Loader2 className="animate-spin" aria-hidden /> : <LocateFixed aria-hidden />}
          Near me
          {hasPoint ? <X className="size-3.5" aria-hidden /> : null}
        </Button>
      </div>

      <Sheet open={open} onOpenChange={openSheet}>
        <SheetContent
          side="right"
          className="w-full max-w-full! sm:max-w-md!"
          aria-describedby={undefined}
        >
          <SheetHeader className="border-b border-border">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Only real listings that match every choice are shown.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-7 overflow-y-auto px-5 pb-4">
            <FilterGroup title="Property type">
              <div className="flex flex-wrap gap-2">
                {PROPERTY_TYPES.map((type) => (
                  <Chip
                    key={type}
                    selected={draft.type.includes(type)}
                    onClick={() => setDraft((d) => ({ ...d, type: toggle(d.type, type) }))}
                  >
                    {PROPERTY_TYPE_LABELS[type]}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Monthly budget (₹)">
              <div className="flex flex-wrap gap-2">
                {BUDGET_PRESETS.map((preset) => {
                  const selected =
                    toInt(draft.budget_min) === preset.min && toInt(draft.budget_max) === preset.max;
                  return (
                    <Chip
                      key={`${preset.min}-${preset.max}`}
                      selected={selected}
                      onClick={() =>
                        setDraft((d) =>
                          selected
                            ? { ...d, budget_min: "", budget_max: "" }
                            : {
                                ...d,
                                budget_min: preset.min?.toString() ?? "",
                                budget_max: preset.max?.toString() ?? "",
                              },
                        )
                      }
                    >
                      {budgetPresetLabel(preset.min, preset.max)}
                    </Chip>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor={ids.min} className="text-xs text-muted-foreground">
                    Minimum
                  </label>
                  <Input
                    id={ids.min}
                    inputMode="numeric"
                    placeholder="0"
                    value={draft.budget_min}
                    onChange={(event) => setDraft((d) => ({ ...d, budget_min: event.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={ids.max} className="text-xs text-muted-foreground">
                    Maximum
                  </label>
                  <Input
                    id={ids.max}
                    inputMode="numeric"
                    placeholder="Any"
                    value={draft.budget_max}
                    onChange={(event) => setDraft((d) => ({ ...d, budget_max: event.target.value }))}
                  />
                </div>
              </div>
            </FilterGroup>

            <FilterGroup title="Who it's for">
              <div className="flex flex-wrap gap-2">
                <Chip selected={draft.gender === null} onClick={() => setDraft((d) => ({ ...d, gender: null }))}>
                  Anyone
                </Chip>
                {(["female", "male"] as const).map((gender) => (
                  <Chip
                    key={gender}
                    selected={draft.gender === gender}
                    onClick={() => setDraft((d) => ({ ...d, gender }))}
                  >
                    {GENDER_FILTER_LABELS[gender]}
                  </Chip>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Includes listings open to everyone.</p>
            </FilterGroup>

            <FilterGroup title="Amenities">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {amenityOptions.map((amenity) => (
                  <label key={amenity.code} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                    <Checkbox
                      checked={amenity.code === "food" ? draft.food : draft.amenities.includes(amenity.code)}
                      onCheckedChange={() =>
                        setDraft((d) =>
                          amenity.code === "food"
                            ? { ...d, food: !d.food }
                            : { ...d, amenities: toggle(d.amenities, amenity.code) },
                        )
                      }
                    />
                    {amenity.code === "food" ? "Food available" : amenity.name}
                  </label>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Furnishing">
              <label htmlFor={ids.furnishing} className="sr-only">
                Furnishing
              </label>
              <NativeSelect
                id={ids.furnishing}
                value={draft.furnishing ?? ""}
                onChange={(event) =>
                  setDraft((d) => ({ ...d, furnishing: (event.target.value || null) as Furnishing | null }))
                }
              >
                <option value="">Any</option>
                {FURNISHINGS.map((value) => (
                  <option key={value} value={value}>
                    {FURNISHING_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            </FilterGroup>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
              <Checkbox
                checked={draft.available_only}
                onCheckedChange={() => setDraft((d) => ({ ...d, available_only: !d.available_only }))}
              />
              Only places with a bed or unit available now
            </label>
          </div>
          <SheetFooter className="flex-row border-t border-border">
            <Button variant="ghost" size="lg" onClick={clearDraft} className="flex-1">
              Clear all
            </Button>
            <Button size="lg" onClick={applyDraft} className="flex-1">
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
