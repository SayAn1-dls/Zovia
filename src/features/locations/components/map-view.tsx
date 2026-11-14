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
  /** With a click handler, pins are buttons (no navigation) and the handler decides what to show. */
  onMarkerClick?: (id: string) => void;
  /** Pin drawn highlighted and above the others (e.g. the card being hovered). */
  activeId?: string | null;
  /** Pin the map glides to whenever it changes. */
  focusId?: string | null;
};

function markerElement(
  marker: MapMarker,
  onClick?: (id: string) => void,
): HTMLElement {
  const el: HTMLElement = document.createElement(marker.href && !onClick ? "a" : "button");
  if (marker.href && !onClick) (el as HTMLAnchorElement).href = marker.href;
  else (el as HTMLButtonElement).type = "button";
  el.setAttribute("aria-label", marker.title ?? marker.label ?? "Location");
  if (marker.title) el.title = marker.title;
  el.className = cn(
    "flex cursor-pointer items-center justify-center rounded-full border-2 border-white font-semibold shadow-md transition-[scale,background-color] duration-150 outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:scale-125 data-[active=true]:bg-ink data-[active=true]:text-lime",
    marker.label ? "h-7 px-2.5 text-xs" : "size-4",
    marker.tone === "muted"
      ? "bg-foreground/70 text-white"
      : "bg-primary text-primary-foreground",
  );
  if (marker.label) el.textContent = marker.label;
  el.dataset.markerId = marker.id;
  if (onClick) {
    // MapLibre captures the pointer on press, so the release (and the click) lands on the map, not
    // the pin. Treat press + release without dragging as a tap; keyboard activation still clicks.
    el.addEventListener("pointerdown", (down: PointerEvent) => {
      down.stopPropagation();
      window.addEventListener(
        "pointerup",
        (up: PointerEvent) => {
          if (
            Math.hypot(up.clientX - down.clientX, up.clientY - down.clientY) < 6
          )
            onClick(marker.id);
        },
        { once: true },
      );
    });
    el.addEventListener("click", (event: MouseEvent) => {
      event.stopPropagation();
      if (event.detail === 0) onClick(marker.id);
    });
  }
  return el;
}

function highlight(markers: Marker[], activeId: string | null) {
  for (const marker of markers) {
    const el = marker.getElement();
    const active = el.dataset.markerId === activeId;
    el.dataset.active = String(active);
    el.style.zIndex = active ? "10" : "";
  }
}

export function MapView({
  center,
  zoom = 13,
  markers = [],
  fitToMarkers = false,
  className,
  label,
  onMarkerClick,
  activeId = null,
  focusId = null,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const activeRef = useRef(activeId);

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
          map.addControl(
            new maplibre.NavigationControl({ showCompass: false }),
            "top-right",
          );
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
        new maplibre.Marker({ element: markerElement(marker, onMarkerClick) })
          .setLngLat([marker.lng, marker.lat])
          .addTo(map),
      );
      highlight(markerRefs.current, activeRef.current);
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

  // Highlight the active pin and lift it above its neighbours.
  useEffect(() => {
    activeRef.current = activeId;
    highlight(markerRefs.current, activeId);
  }, [activeId]);

  useEffect(() => {
    const map = mapRef.current;
    const target = focusId
      ? markers.find((marker) => marker.id === focusId)
      : undefined;
    if (!map || !ready || !target) return;
    map.easeTo({
      center: [target.lng, target.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 600,
    });
  }, [focusId, markers, ready]);

  return (
    <div
      role="region"
      aria-label={label}
      className={cn("relative overflow-hidden rounded-2xl bg-muted", className)}
    >
      {/* Inline position: maplibre-gl.css sets .maplibregl-map { position: relative } outside Tailwind's
          layers, which would beat an `absolute` class and collapse the map to 0 px tall. */}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          The map could not load on this device.
        </p>
      ) : null}
    </div>
  );
}
