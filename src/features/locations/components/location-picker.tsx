"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { MAP_FILL, MAP_STYLE_URL } from "./map-view";

export type LatLng = { lat: number; lng: number };

/** Rough centre of India, used when nothing better is known. */
export const INDIA_CENTER: LatLng = { lat: 22.5, lng: 79 };

/**
 * Pin picker for owners: drag the pin or tap the map to place it. `value` null shows the map
 * without a pin (tap to place). When `value` changes from outside (e.g. after geocoding an
 * address) the map recentres on it.
 */
export function LocationPicker({
  value,
  onChange,
  fallbackCenter = INDIA_CENTER,
  className,
}: {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  fallbackCenter?: LatLng;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let cancelled = false;
    void import("maplibre-gl")
      .then(({ default: maplibre }) => {
        if (cancelled || !containerRef.current) return;
        const start = value ?? fallbackCenter;
        const map = new maplibre.Map({
          container: containerRef.current,
          style: MAP_STYLE_URL,
          center: [start.lng, start.lat],
          zoom: value ? 16 : 4,
          attributionControl: { compact: true },
        });
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        const marker = new maplibre.Marker({ draggable: true, color: "#6D4AFF" });
        if (value) marker.setLngLat([value.lng, value.lat]).addTo(map);
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLngLat();
          onChangeRef.current({ lat, lng });
        });
        map.on("click", (event) => {
          marker.setLngLat(event.lngLat).addTo(map);
          onChangeRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
        });
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Created once; value changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !value) return;
    const current = marker.getLngLat?.();
    if (current && Math.abs(current.lat - value.lat) < 1e-7 && Math.abs(current.lng - value.lng) < 1e-7) return;
    marker.setLngLat([value.lng, value.lat]).addTo(map);
    map.jumpTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), 16) });
  }, [value]);

  return (
    <div className={cn("relative h-72 overflow-hidden rounded-2xl border border-border bg-muted", className)}>
      <div ref={containerRef} style={MAP_FILL} aria-label="Map: tap to place the pin, or drag it" />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground">
          The map could not load. Check your connection.
        </p>
      ) : null}
    </div>
  );
}
