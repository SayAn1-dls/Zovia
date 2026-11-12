import { ExternalLink, Info, MapPin, Star } from "lucide-react";

import { buildApiUrl } from "@/lib/api/client";
import { formatNumber } from "@/lib/format";

import type { GooglePlace } from "../schemas";

/**
 * "PGs and hostels on Google Maps" (spec 14.3): discovery only, clearly separate from ZUVIO
 * listings. Price and vacancy are unknown and labelled so. Photos come through our proxy route
 * (the API key stays on the server) with the photographers' attributions, as Google requires.
 */
export function GooglePlacesSection({ cityName, places }: { cityName: string; places: GooglePlace[] }) {
  return (
    <section aria-labelledby="google-places-heading" className="mt-14 border-t border-border pt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="google-places-heading" className="text-display-sm font-bold">
            PGs and hostels on Google Maps
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">More places in {cityName}, from Google Maps.</p>
        </div>
        <p className="inline-flex items-center gap-1.5 self-start rounded-full bg-warning-surface px-3 py-1.5 text-xs font-semibold text-warning-foreground">
          <Info className="size-3.5" aria-hidden />
          Price and vacancy not listed on ZUVIO
        </p>
      </div>
      {places.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Google Maps returned no places for {cityName}.</p>
      ) : (
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <li key={place.place_id} className="flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border">
              <div className="relative aspect-[4/3] bg-muted">
                {place.photo ? (
                  // Same-origin proxy URL with a query string: next/image would need a localPatterns entry.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={buildApiUrl("/locations/google-photo", { name: place.photo.name })}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No photo</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-4">
                <h3 className="font-semibold">{place.name}</h3>
                {place.address ? (
                  <p className="flex gap-1 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-2">{place.address}</span>
                  </p>
                ) : null}
                {place.rating !== null ? (
                  <p className="flex items-center gap-1 text-sm">
                    <Star className="size-3.5 fill-warning text-warning" aria-hidden />
                    <span className="font-semibold">{place.rating.toFixed(1)}</span>
                    {place.rating_count !== null ? (
                      <span className="text-muted-foreground">({formatNumber(place.rating_count)} on Google)</span>
                    ) : null}
                  </p>
                ) : null}
                {place.photo && place.photo.attributions.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Photo:{" "}
                    {place.photo.attributions.map((a, index) => (
                      <span key={`${a.name}-${index}`}>
                        {index > 0 ? ", " : null}
                        {a.uri ? (
                          <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">
                            {a.name}
                          </a>
                        ) : (
                          a.name
                        )}
                      </span>
                    ))}
                  </p>
                ) : null}
                {place.maps_url ? (
                  <a
                    href={place.maps_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-2 text-sm font-semibold underline underline-offset-4"
                  >
                    Open in Google Maps
                    <ExternalLink className="size-3.5" aria-hidden />
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Listings above this section are from owners on ZUVIO. Data in this section © Google.</p>
    </section>
  );
}
