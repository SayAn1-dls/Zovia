import { BedDouble, MapPin, Navigation } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/money";
import { RatingStars } from "@/components/rating-stars";
import { StatusBadge } from "@/components/status-badge";
import { VerifiedBadge } from "@/components/verified-badge";
import { straightLineLabel } from "@/features/locations/geo";
import { formatDate } from "@/lib/format";
import { dynamicRoutes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { bedAvailabilityLabel, pricePrefix } from "../presenters";
import { PROPERTY_TYPE_LABELS, type SearchResultItem } from "../schemas";
import { NoPhotos, PropertyPhoto } from "./property-photo";
import { SaveButton } from "./save-button";

export type PropertyCardData = Pick<
  SearchResultItem,
  | "id"
  | "slug"
  | "title"
  | "property_type"
  | "listing_mode"
  | "locality"
  | "city"
  | "price_from"
  | "available_beds"
  | "total_beds"
  | "cover_url"
  | "rating_avg"
  | "rating_count"
> &
  Partial<Pick<SearchResultItem, "recently_confirmed" | "distance_m" | "availability_status" | "available_from">>;

/**
 * A listing in a grid. Bed counts ("3 of 8 beds available") are shown for per-bed listings and
 * the property's own availability statement for entire units; the two are never merged.
 */
export function PropertyCard({
  property,
  highlighted = false,
  onSavedChange,
  priority = false,
}: {
  property: PropertyCardData;
  highlighted?: boolean;
  onSavedChange?: (saved: boolean) => void;
  priority?: boolean;
}) {
  const place = [property.locality, property.city].filter(Boolean).join(", ");
  const prefix = pricePrefix(property.listing_mode);

  return (
    <article
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border transition-shadow hover:shadow-lg",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {property.cover_url ? (
          <PropertyPhoto
            src={property.cover_url}
            alt=""
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            preload={priority}
            className="transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <NoPhotos compact />
        )}
        {property.id.startsWith("catalog:") ? null : (
          <div className="absolute top-2 right-2 z-10">
            <SaveButton propertyId={property.id} title={property.title} onChange={onSavedChange} />
          </div>
        )}
        {property.recently_confirmed ? (
          <div className="absolute bottom-2 left-2">
            <VerifiedBadge kind="recently_confirmed" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-base leading-snug font-semibold">
            <Link
              href={dynamicRoutes.property(property.slug)}
              className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
            >
              {property.title}
            </Link>
          </h3>
          {property.rating_count > 0 ? (
            <RatingStars value={property.rating_avg} count={property.rating_count} className="shrink-0" />
          ) : null}
        </div>
        {place ? (
          <p className="flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{place}</span>
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">{PROPERTY_TYPE_LABELS[property.property_type]}</p>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-2">
          <p className="text-lg font-bold">
            {property.price_from !== null ? (
              <>
                {prefix ? <span className="mr-1 text-sm font-normal text-muted-foreground">from</span> : null}
                <Money amount={property.price_from} suffix="/mo" />
              </>
            ) : (
              <span className="text-sm font-normal text-muted-foreground">Rent not listed yet</span>
            )}
          </p>
          {property.listing_mode === "per_bed" ? (
            <p
              className={cn(
                "flex items-center gap-1 text-sm font-medium",
                property.available_beds > 0 ? "text-success-foreground" : "text-muted-foreground",
              )}
            >
              <BedDouble className="size-4" aria-hidden />
              {bedAvailabilityLabel(property.available_beds, property.total_beds)}
            </p>
          ) : property.availability_status ? (
            <StatusBadge
              status={property.availability_status}
              label={
                property.availability_status === "coming_soon" && property.available_from
                  ? `From ${formatDate(property.available_from, { day: "numeric", month: "short" })}`
                  : undefined
              }
            />
          ) : null}
        </div>
        {property.distance_m !== null && property.distance_m !== undefined ? (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Navigation className="size-3" aria-hidden />
            {straightLineLabel(property.distance_m)}
          </p>
        ) : null}
      </div>
    </article>
  );
}
