"use client";

import { List, Map as MapIcon, SearchX } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Pagination } from "@/components/pagination";
import { buttonVariants } from "@/components/ui/button";
import { INDIA_CENTER } from "@/features/locations/components/location-picker";
import { MapView, type MapMarker } from "@/features/locations/components/map-view";
import { formatINRCompact, pluralize } from "@/lib/format";
import { dynamicRoutes, routes, withQuery } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { searchFiltersToQuery, type SearchFilters, type SearchResponse } from "../schemas";
import { PropertyCard } from "./property-card";
import { useSearchTransition } from "./search-transition";

const DESKTOP = "(min-width: 1024px)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on lg screens, where list and map show side by side (false during server rendering). */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/**
 * Results grid + price map. Desktop shows both side by side; phones switch between list and
 * map. Old results stay (dimmed) while a new page loads.
 */
export function SearchResultsView({ response, filters }: { response: SearchResponse; filters: SearchFilters }) {
  const { isPending } = useSearchTransition();
  const [view, setView] = useState<"list" | "map">("list");
  const isDesktop = useIsDesktop();
  const totalPages = Math.max(1, Math.ceil(response.total / response.limit));

  const markers = useMemo<MapMarker[]>(
    () =>
      response.items.flatMap((item) =>
        item.lat !== null && item.lng !== null
          ? [
              {
                id: item.id,
                lat: item.lat,
                lng: item.lng,
                label: item.price_from !== null ? formatINRCompact(item.price_from) : "—",
                title: item.title,
                href: dynamicRoutes.property(item.slug),
              },
            ]
          : [],
      ),
    [response.items],
  );
  const first = markers[0];
  const center = first ?? response.origin ?? response.city ?? INDIA_CENTER;
  const zoom = first || response.city ? 12 : 4;

  const place = response.city?.name ?? filters.city;
  const heading = `${pluralize(response.total, "place")}${place ? ` in ${place}` : ""}`;

  if (response.total === 0 || response.items.length === 0) {
    const clearHref = withQuery(routes.search, { city: response.city?.slug ?? filters.city });
    return (
      <div className={cn("transition-opacity", isPending && "opacity-60")} aria-busy={isPending}>
        <EmptyState
          icon={SearchX}
          title="No listings match yet"
          description={
            response.page > 1 && response.total > 0
              ? "This page is past the last result."
              : "New places appear here as owners list them. Try fewer filters or another area."
          }
          action={
            <Link href={clearHref} className={buttonVariants({ size: "lg" })}>
              Clear filters
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div aria-busy={isPending}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold" aria-live="polite">
          {heading}
        </h2>
        <div className="flex rounded-full bg-muted p-1 lg:hidden" role="group" aria-label="Show results as">
          {(
            [
              { value: "list", label: "List", icon: List },
              { value: "map", label: "Map", icon: MapIcon },
            ] as const
          ).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold",
                view === value ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className={cn("transition-opacity", isPending && "opacity-60", view === "map" && "hidden lg:block")}>
          <ul className="grid gap-x-5 gap-y-8 sm:grid-cols-2">
            {response.items.map((item, index) => (
              <li key={item.id} className="flex">
                <div className="w-full">
                  <PropertyCard property={item} priority={index < 2} />
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            className="mt-8"
            page={response.page}
            totalPages={totalPages}
            hrefForPage={(page) => withQuery(routes.search, searchFiltersToQuery({ ...filters, page }))}
          />
        </div>
        <div className={cn(view === "list" && "hidden lg:block")}>
          <div className="lg:sticky lg:top-24">
            {isDesktop || view === "map" ? (
            <MapView
              center={center}
              zoom={zoom}
              markers={markers}
              fitToMarkers
              label={`Map of ${heading}`}
              className="h-[calc(100dvh-16rem)] min-h-80 overflow-hidden rounded-3xl lg:h-[calc(100dvh-8rem)]"
            />
            ) : null}
            {markers.length < response.items.length ? (
              <p className="mt-2 text-xs text-muted-foreground">Some listings have no map pin.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
