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
    <article className="group relative flex flex-col">
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-black/5 transition-[transform,box-shadow] duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg motion-reduce:transition-none motion-reduce:group-hover:translate-y-0",
          highlighted && "ring-2 ring-primary",
        )}
      >
        {property.cover_url ? (
          <PropertyPhoto
            src={property.cover_url}
            alt=""
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            preload={priority}
            className="transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
          />
        ) : (
          <NoPhotos compact />
        )}
        <div className="absolute top-2 right-2 z-10">
          <SaveButton propertyId={property.id} title={property.title} onChange={onSavedChange} />
        </div>
        {property.recently_confirmed ? (
          <div className="absolute top-3 left-3">
            <VerifiedBadge kind="recently_confirmed" />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 pt-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-1 text-[0.9375rem] leading-snug font-semibold">
            <Link
              href={dynamicRoutes.property(property.slug)}
              className="rounded-sm outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{PROPERTY_TYPE_LABELS[property.property_type]}</span>
          {property.listing_mode === "per_bed" ? (
            <>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1",
                  property.available_beds > 0 ? "font-medium text-success-foreground" : "",
                )}
              >
                <BedDouble className="size-3.5" aria-hidden />
                {bedAvailabilityLabel(property.available_beds, property.total_beds)}
              </span>
            </>
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
          {property.distance_m !== null && property.distance_m !== undefined ? (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Navigation className="size-3" aria-hidden />
                {straightLineLabel(property.distance_m)}
              </span>
            </>
          ) : null}
        </div>
        <p className="mt-1 text-[0.9375rem]">
          {property.price_from !== null ? (
            <>
              {prefix ? <span className="mr-1 text-muted-foreground">from</span> : null}
              <span className="font-bold">
                <Money amount={property.price_from} suffix="/mo" />
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Rent not listed yet</span>
          )}
        </p>
      </div>
    </article>
  );
}
