"use client";

import { MapPinOff, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { straightLineLabel } from "../geo";
import { useNearbyPlaces } from "../queries";
import { NEARBY_KIND_LABELS, NEARBY_KINDS, NEARBY_RADIUS_M, type LatLng, type NearbyPlace } from "../schemas";

const GROUPS = [...new Set(NEARBY_KINDS.map((k) => k.group))];

/**
 * Colleges, stations, hospitals, shops ... near a point, from OpenStreetMap. Loaded in the
 * browser (public, cached), so the page itself stays cacheable. Distances are straight-line and
 * say so. When the provider fails the section says so; nothing is ever made up.
 */
export function NearbyPlaces({ point }: { point: LatLng }) {
  const query = useNearbyPlaces(point);

  if (query.isPending) {
    return (
      <div role="status" aria-busy="true" className="grid gap-6 sm:grid-cols-2">
        <span className="sr-only">Loading nearby places</span>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2" aria-hidden>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl bg-muted p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <MapPinOff className="size-4" aria-hidden />
          Nearby places couldn&apos;t load.
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          <RotateCw aria-hidden />
          Try again
        </Button>
      </div>
    );
  }

  const { places, attribution } = query.data;
  if (places.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        OpenStreetMap has no named colleges, stations, hospitals or shops within {NEARBY_RADIUS_M / 1000} km of this
        pin.
      </p>
    );
  }

  const byGroup = new Map<string, NearbyPlace[]>();
  for (const place of places) {
    const group = NEARBY_KINDS.find((k) => k.kind === place.kind)?.group ?? "Other";
    byGroup.set(group, [...(byGroup.get(group) ?? []), place]);
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        {GROUPS.filter((group) => byGroup.has(group)).map((group) => (
          <div key={group}>
            <h3 className="text-sm font-semibold">{group}</h3>
            <ul className="mt-2 divide-y divide-border text-sm">
              {byGroup.get(group)!.map((place) => (
                <li key={place.id} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{place.name}</span>
                    <span className="text-xs text-muted-foreground">{NEARBY_KIND_LABELS[place.kind]}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {straightLineLabel(place.straight_line_m)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Straight-line distance from the listing&apos;s pin, not travel distance. Within {NEARBY_RADIUS_M / 1000} km.
        Data{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {attribution}
        </a>
        .
      </p>
    </div>
  );
}
