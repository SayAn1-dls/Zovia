import { ExternalLink, Globe, Info, MapPin, Phone } from "lucide-react";

import type { OsmHousing } from "../osm/housing";
import { OSM_HOUSING_KIND_LABELS } from "../osm/housing";
import { MapView } from "./map-view";

/**
 * "Hostels and PGs on OpenStreetMap" (spec 14.3 discovery). Real places mapped by OSM
 * contributors; ZUVIO has no price or vacancy for them and says so. Separate from ZUVIO listings.
 */
export function OsmHousingSection({
  cityName,
  centre,
  places,
  attribution,
}: {
  cityName: string;
  centre: { lat: number; lng: number };
  places: OsmHousing[];
  attribution: string;
}) {
  return (
    <section aria-labelledby="osm-housing-heading" className="mt-14 border-t border-border pt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="osm-housing-heading" className="text-display-sm font-bold">
            Hostels and PGs in {cityName}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Real places from OpenStreetMap near the city centre. Call or visit to ask.</p>
        </div>
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-warning-surface px-3 py-1.5 text-xs font-semibold text-warning-foreground">
          <Info className="size-3.5" aria-hidden />
          Not listed on ZUVIO: price and vacancy unknown
        </p>
      </div>

      {places.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">OpenStreetMap has no hostels or PGs mapped near the centre of {cityName} yet.</p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
          <ul className="grid gap-3 sm:grid-cols-2">
            {places.map((place) => (
              <li key={place.id} className="flex flex-col gap-2 rounded-2xl bg-card p-4 ring-1 ring-border transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold leading-snug">{place.name}</p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {OSM_HOUSING_KIND_LABELS[place.kind]}
                  </span>
                </div>
                {place.address ? (
                  <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {place.address}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-1 text-sm">
                  {place.phone ? (
                    <a href={`tel:${place.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                      <Phone className="size-3.5" aria-hidden />
                      {place.phone}
                    </a>
                  ) : null}
                  {place.website ? (
                    <a href={place.website} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">
                      <Globe className="size-3.5" aria-hidden />
                      Website
                    </a>
                  ) : null}
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=18/${place.lat}/${place.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    <ExternalLink className="size-3.5" aria-hidden />
                    Map
                  </a>
                </div>
              </li>
            ))}
          </ul>
          <MapView
            label={`Map of hostels and PGs in ${cityName}`}
            center={centre}
            zoom={12}
            fitToMarkers
            markers={places.map((place) => ({ id: place.id, lat: place.lat, lng: place.lng, title: place.name, tone: "muted" }))}
            className="h-80 lg:sticky lg:top-24 lg:h-[32rem]"
          />
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Data {attribution}, ODbL.{" "}
        <a href="https://www.openstreetmap.org/copyright" className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
          Licence
        </a>
      </p>
    </section>
  );
}
