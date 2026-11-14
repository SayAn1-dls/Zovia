"use client";

import { ArrowRight, MousePointerClick, X } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useCallback, useMemo, useState } from "react";

import {
  NoPhotos,
  PropertyPhoto,
} from "@/features/properties/components/property-photo";
import { formatINR, formatINRCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

import { MapView, type MapMarker } from "./map-view";

export type MapPanelItem = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  /** "Kothrud, Pune" */
  place: string;
  /** Lowest monthly rent; null when the owner has not set one. */
  price: number | null;
  photo?: { src: string; alt: string } | null;
  href: Route;
  /** Short facts for the preview: "Pure veg", "No smoking", "4 beds left" ... */
  tags?: string[];
};

const BINS = 12;

/** Rent spread of what is on the map: a small bar chart, lowest to highest rent. */
function rentStats(items: MapPanelItem[]) {
  const prices = items
    .map((item) => item.price)
    .filter((price): price is number => price !== null);
  if (prices.length === 0) return null;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg =
    Math.round(
      prices.reduce((sum, price) => sum + price, 0) / prices.length / 100,
    ) * 100;
  const binOf = (price: number) =>
    max === min
      ? 0
      : Math.min(BINS - 1, Math.floor(((price - min) / (max - min)) * BINS));
  const bins = Array.from({ length: BINS }, () => 0);
  for (const price of prices) bins[binOf(price)]! += 1;
  return { min, max, avg, bins, peak: Math.max(...bins), binOf };
}

/**
 * The map beside a list of homes, made useful: price pins, a live rent-spread strip on top, and
 * a preview card when a pin is tapped (photo, rent, key facts, link) instead of jumping away.
 * `activeId` lets the list light up the pin of the card under the pointer.
 */
export function MapPanel({
  items,
  center,
  zoom = 12,
  label,
  activeId = null,
  className,
}: {
  items: MapPanelItem[];
  center: { lat: number; lng: number };
  zoom?: number;
  label: string;
  activeId?: string | null;
  className?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const highlighted = selected?.id ?? activeId;
  const stats = useMemo(() => rentStats(items), [items]);
  const markers = useMemo<MapMarker[]>(
    () =>
      items.map((item) => ({
        id: item.id,
        lat: item.lat,
        lng: item.lng,
        label: item.price !== null ? formatINRCompact(item.price) : "—",
        title: item.title,
        href: item.href,
      })),
    [items],
  );
  const onMarkerClick = useCallback(
    (id: string) => setSelectedId((current) => (current === id ? null : id)),
    [],
  );
  const highlightedItem = items.find((item) => item.id === highlighted);
  const highlightedBin =
    stats && highlightedItem?.price != null
      ? stats.binOf(highlightedItem.price)
      : null;

  return (
    <div className={cn("relative isolate", className)}>
      <div className="absolute inset-0">
        <MapView
          center={center}
          zoom={zoom}
          markers={markers}
          fitToMarkers
          label={label}
          onMarkerClick={onMarkerClick}
          activeId={highlighted}
          focusId={selectedId}
          className="h-full"
        />
      </div>

      {stats ? (
        <div className="pointer-events-none absolute top-3 left-3 z-10 w-[min(17rem,calc(100%-4.5rem))] rounded-2xl bg-ink/90 p-3 text-white shadow-lg backdrop-blur">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium text-white/70">
              {items.length} {items.length === 1 ? "place" : "places"} on the
              map
            </p>
            <p className="text-xs text-white/70">
              avg{" "}
              <span className="font-semibold text-lime">
                {formatINRCompact(stats.avg)}
              </span>
            </p>
          </div>
          <div className="mt-2 flex h-10 items-end gap-0.5" aria-hidden>
            {stats.bins.map((count, index) => (
              <span
                key={index}
                className={cn(
                  "flex-1 rounded-t-sm transition-colors duration-200",
                  index === highlightedBin
                    ? "bg-lime"
                    : count > 0
                      ? "bg-white/45"
                      : "bg-white/10",
                )}
                style={{
                  height: `${Math.max(8, (count / stats.peak) * 100)}%`,
                }}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[0.6875rem] font-medium text-white/70 tabular-nums">
            <span>{formatINRCompact(stats.min)}</span>
            <span>rent per month</span>
            <span>{formatINRCompact(stats.max)}</span>
          </div>
        </div>
      ) : null}

      {selected ? (
        <article
          key={selected.id}
          className="absolute inset-x-3 bottom-3 z-10 flex animate-in gap-3 overflow-hidden rounded-2xl bg-card p-2 pr-3 shadow-xl ring-1 ring-border duration-200 fade-in slide-in-from-bottom-4"
        >
          <div className="relative w-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:w-32">
            {selected.photo ? (
              <PropertyPhoto
                src={selected.photo.src}
                alt={selected.photo.alt}
                sizes="128px"
              />
            ) : (
              <NoPhotos compact />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 font-heading text-[0.9375rem] font-bold">
                {selected.title}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Close preview"
                className="-mt-1 -mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {selected.place}
            </p>
            {selected.tags?.length ? (
              <ul className="flex flex-wrap gap-1">
                {selected.tags.slice(0, 3).map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full bg-muted px-2 py-0.5 text-[0.6875rem] font-medium"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-auto flex items-end justify-between gap-2 pt-1">
              <p className="text-sm">
                {selected.price !== null ? (
                  <>
                    <span className="font-bold">
                      {formatINR(selected.price)}
                    </span>
                    <span className="text-muted-foreground">/mo</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Rent on request</span>
                )}
              </p>
              <Link
                href={selected.href}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-ink px-3 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                View
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </article>
      ) : items.length > 0 ? (
        <p className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-xs font-medium shadow-md ring-1 ring-border">
          <MousePointerClick className="size-3.5" aria-hidden />
          Tap a price pin to preview
        </p>
      ) : null}
    </div>
  );
}
