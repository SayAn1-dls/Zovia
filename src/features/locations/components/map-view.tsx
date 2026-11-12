"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Map display (spec section 8): MapLibre GL with keyless OpenFreeMap vector tiles. No API key.
 * Loaded only in the browser; renders a quiet placeholder until the library is ready and a
 * plain message if WebGL is unavailable.
 */

/**
 * MapLibre's stylesheet sets `.maplibregl-map { position: relative }` on the container, which
 * beats a Tailwind `absolute` class and collapses the map to 0 px high. Inline style wins.
 */
export const MAP_FILL = { position: "absolute", inset: 0 } as const;

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  /** Short text shown in the marker bubble (e.g. a price); plain dot when omitted. */
  label?: string;
  /** Accessible name and tooltip. */
  title?: string;
  href?: string;
  tone?: "primary" | "muted";
};

type MapViewProps = {
  center: { lat: number; lng: number };
  zoom?: number;
  markers?: MapMarker[];
  /** Fit the view to all markers (when there are 2 or more). */
  fitToMarkers?: boolean;
  className?: string;
  /** Accessible description of what the map shows. */
  label: string;
  onMarkerClick?: (id: string) => void;
};

function markerElement(marker: MapMarker, onClick?: (id: string) => void): HTMLElement {
  const el = document.createElement(marker.href ? "a" : "button");
  if (marker.href) (el as HTMLAnchorElement).href = marker.href;
  else (el as HTMLButtonElement).type = "button";
  el.setAttribute("aria-label", marker.title ?? marker.label ?? "Location");
  if (marker.title) el.title = marker.title;
  el.className = cn(
    "flex items-center justify-center rounded-full border-2 border-white font-semibold shadow-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
    marker.label ? "h-7 px-2.5 text-xs" : "size-4",
    marker.tone === "muted" ? "bg-foreground/70 text-white" : "bg-primary text-primary-foreground",
  );
  if (marker.label) el.textContent = marker.label;
  if (onClick) el.addEventListener("click", () => onClick(marker.id));
  return el;
}

export function MapView({ center, zoom = 13, markers = [], fitToMarkers = false, className, label, onMarkerClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl")
      .then(({ default: maplibre }) => {
        if (cancelled || !containerRef.current) return;
        try {
          const map = new maplibre.Map({
            container: containerRef.current,
            style: MAP_STYLE_URL,
            center: [center.lng, center.lat],
            zoom,
            attributionControl: { compact: true },
            cooperativeGestures: true,
          });
          map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
          map.on("load", () => setReady(true));
          mapRef.current = map;
        } catch {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later center/zoom changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mapRef.current?.jumpTo({ center: [center.lng, center.lat], zoom });
  }, [center.lat, center.lng, zoom]);

  // Sync markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;
    void import("maplibre-gl").then(({ default: maplibre }) => {
      if (cancelled) return;
      for (const m of markerRefs.current) m.remove();
      markerRefs.current = markers.map((marker) =>
        new maplibre.Marker({ element: markerElement(marker, onMarkerClick) }).setLngLat([marker.lng, marker.lat]).addTo(map),
      );
      if (fitToMarkers && markers.length > 1) {
        const bounds = new maplibre.LngLatBounds();
        for (const marker of markers) bounds.extend([marker.lng, marker.lat]);
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 0 });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [markers, ready, fitToMarkers, onMarkerClick]);

  return (
    <div role="region" aria-label={label} className={cn("relative overflow-hidden rounded-2xl bg-muted", className)}>
      <div ref={containerRef} style={MAP_FILL} />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          The map could not load on this device.
        </p>
      ) : null}
    </div>
  );
}
