"use client";

import { List, Map as MapIcon, RotateCcw, SearchX } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { MapView, type MapMarker } from "@/features/locations/components/map-view";
import { NativeSelect } from "@/features/properties/components/native-select";
import { formatINRCompact } from "@/lib/format";
import { dynamicRoutes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import type { CatalogListing, SharingType } from "../listings";
import { CatalogCard } from "./catalog-card";

type Filters = {
  kind: "" | "pg" | "hostel" | "co_living";
  gender: "" | "male" | "female";
  food: "" | "veg" | "nonveg" | "meals" | "kitchen";
  smoking: "" | "allowed" | "free";
  sharing: "" | SharingType;
  budget: "" | (typeof BUDGETS)[number];
  area: string;
  ac: boolean;
  available: boolean;
  sort: "recommended" | "price_asc" | "price_desc" | "beds";
};

const BUDGETS = ["8000", "12000", "15000", "18000", "25000"] as const;

/** Filters a link can preset: /cities/pune?budget=15000&food=veg&gender=female&type=pg */
function fromQuery(query: URLSearchParams): Filters {
  const pick = <T extends string>(value: string | null, allowed: readonly T[]): T | "" =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : "";
  return {
    ...EMPTY,
    budget: pick(query.get("budget"), BUDGETS),
    food: pick(query.get("food"), ["veg", "nonveg", "meals", "kitchen"] as const),
    gender: pick(query.get("gender"), ["male", "female"] as const),
    kind: pick(query.get("type"), ["pg", "hostel", "co_living"] as const),
    smoking: pick(query.get("smoking"), ["allowed", "free"] as const),
  };
}

const EMPTY: Filters = {
  kind: "",
  gender: "",
  food: "",
  smoking: "",
  sharing: "",
  budget: "",
  area: "",
  ac: false,
  available: false,
  sort: "recommended",
};

function matches(listing: CatalogListing, f: Filters): boolean {
  if (f.kind && listing.kind !== f.kind) return false;
  if (f.gender && listing.gender !== "any" && listing.gender !== f.gender) return false;
  if (f.food === "veg" && listing.food.diet !== "veg") return false;
  if (f.food === "nonveg" && listing.food.diet !== "veg_nonveg" && !listing.rules.non_veg_cooking) return false;
  if (f.food === "meals" && !listing.food.provided) return false;
  if (f.food === "kitchen" && !listing.food.kitchen_access) return false;
  if (f.smoking === "allowed" && listing.rules.smoking === "not_allowed") return false;
  if (f.smoking === "free" && listing.rules.smoking !== "not_allowed") return false;
  const options = f.sharing ? listing.sharing.filter((option) => option.type === f.sharing) : listing.sharing;
  if (options.length === 0) return false;
  if (f.budget && !options.some((option) => option.rent <= Number(f.budget))) return false;
  if (f.ac && !options.some((option) => option.ac)) return false;
  if (f.available && !options.some((option) => option.beds_left > 0)) return false;
  if (f.area && listing.locality !== f.area) return false;
  return true;
}

const DESKTOP = "(min-width: 1024px)";
function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * The PGs of one city with every filter people ask for (type, who it's for, veg / non-veg,
 * smoking, sharing, budget, AC, neighbourhood) and a price map. Filtering runs in the browser,
 * so it is instant.
 */
export function CityBrowser({
  cityName,
  centre,
  listings,
  stations = {},
}: {
  cityName: string;
  centre: { lat: number; lng: number };
  listings: CatalogListing[];
  /** Listing slug -> "6 min walk to X Metro". */
  stations?: Record<string, string>;
}) {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  // Presets from the link (?budget=, ?food= ...) are applied after hydration, so the full list
  // still renders on the server.
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time sync from the URL
    if (query.size > 0) setFilters(fromQuery(query));
  }, []);
  const [view, setView] = useState<"list" | "map">("list");
  const [hovered, setHovered] = useState<string | null>(null);
  const isDesktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP).matches, () => false);

  const areas = useMemo(() => [...new Set(listings.map((listing) => listing.locality))], [listings]);
  const results = useMemo(() => {
    const list = listings.filter((listing) => matches(listing, filters));
    if (filters.sort === "price_asc") list.sort((a, b) => a.price_from - b.price_from);
    if (filters.sort === "price_desc") list.sort((a, b) => b.price_from - a.price_from);
    if (filters.sort === "beds") list.sort((a, b) => b.available_beds - a.available_beds);
    return list;
  }, [listings, filters]);

  const markers = useMemo<MapMarker[]>(
    () =>
      results.map((listing) => ({
        id: listing.slug,
        lat: listing.lat,
        lng: listing.lng,
        label: formatINRCompact(listing.price_from),
        title: listing.title,
        href: dynamicRoutes.property(listing.slug),
      })),
    [results],
  );

  const set = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const active = (Object.keys(EMPTY) as (keyof Filters)[]).filter((key) => key !== "sort" && filters[key] !== EMPTY[key]).length;

  const selects: { key: keyof Filters; label: string; options: [string, string][] }[] = [
    { key: "kind", label: "Type", options: [["", "All types"], ["pg", "PG"], ["hostel", "Hostel"], ["co_living", "Co-living"]] },
    { key: "gender", label: "For", options: [["", "Anyone"], ["male", "Men"], ["female", "Women"]] },
    {
      key: "food",
      label: "Food",
      options: [["", "Any food"], ["veg", "Pure veg"], ["nonveg", "Non-veg allowed"], ["meals", "Meals included"], ["kitchen", "Kitchen access"]],
    },
    { key: "smoking", label: "Smoking", options: [["", "Smoking: any"], ["allowed", "Smoking allowed"], ["free", "Smoke-free"]] },
    { key: "sharing", label: "Sharing", options: [["", "Any sharing"], ["single", "Single room"], ["double", "Double sharing"], ["triple", "Triple sharing"]] },
    {
      key: "budget",
      label: "Budget",
      options: [["", "Any budget"], ...BUDGETS.map((value): [string, string] => [value, `Up to ${formatINRCompact(Number(value))}`])],
    },
    { key: "area", label: "Area", options: [["", "All areas"], ...areas.map((area): [string, string] => [area, area])] },
    {
      key: "sort",
      label: "Sort",
      options: [["recommended", "Recommended"], ["price_asc", "Price: low to high"], ["price_desc", "Price: high to low"], ["beds", "Most beds free"]],
    },
  ];

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-5 border-b border-border bg-background/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {selects.map(({ key, label, options }) => (
            <label key={key} className="min-w-0">
              <span className="sr-only">{label}</span>
              <NativeSelect
                value={String(filters[key])}
                onChange={(event) => set(key, event.target.value as never)}
                className={cn("h-10 text-sm md:text-sm", filters[key] !== EMPTY[key] && "border-foreground bg-lime/40")}
              >
                {options.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </NativeSelect>
            </label>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(
            [
              ["ac", "AC rooms"],
              ["available", "Beds available now"],
            ] as const
          ).map(([key, text]) => (
            <button
              key={key}
              type="button"
              aria-pressed={filters[key]}
              onClick={() => set(key, !filters[key])}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
                filters[key] ? "border-ink bg-ink text-white" : "border-foreground/20 bg-card hover:border-foreground",
              )}
            >
              {text}
            </button>
          ))}
          {active > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setFilters({ ...EMPTY, sort: filters.sort })}>
              <RotateCcw aria-hidden />
              Clear {active}
            </Button>
          ) : null}
          <p className="ml-auto text-sm font-semibold" aria-live="polite">
            {results.length} {results.length === 1 ? "place" : "places"} in {cityName}
          </p>
          <div className="flex rounded-full bg-muted p-1 lg:hidden" role="group" aria-label="Show results as">
            {(
              [
                ["list", "List", List],
                ["map", "Map", MapIcon],
              ] as const
            ).map(([value, text, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold",
                  view === value ? "bg-card shadow-sm" : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>

      {results.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={SearchX}
          title="Nothing matches all of those"
          description="Try removing a filter or two: most people find a match by widening the budget or the area."
          action={<Button onClick={() => setFilters(EMPTY)}>Clear filters</Button>}
        />
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_28rem]">
          <ul className={cn("grid gap-5 sm:grid-cols-2", view === "map" && "hidden lg:grid")}>
            {results.map((listing, index) => (
              <li key={listing.slug}>
                <CatalogCard
                  listing={listing}
                  station={stations[listing.slug]}
                  priority={index < 2}
                  highlighted={hovered === listing.slug}
                  onHover={setHovered}
                />
              </li>
            ))}
          </ul>
          <div className={cn(view === "list" && "hidden lg:block")}>
            <div className="lg:sticky lg:top-44">
              {isDesktop || view === "map" ? (
                <MapView
                  center={centre}
                  zoom={12}
                  markers={markers}
                  fitToMarkers
                  label={`Map of PGs in ${cityName}`}
                  className="h-[calc(100dvh-14rem)] min-h-80 lg:h-[calc(100dvh-13rem)]"
                />
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">Pins show the lowest monthly rent. Tap a pin to open the PG.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
