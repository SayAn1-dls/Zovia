"use client";


import { BedDouble, Cigarette, CigaretteOff, Leaf, MapPin, Snowflake, TrainFront, Users, UtensilsCrossed } from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/money";
import { PropertyPhoto } from "@/features/properties/components/property-photo";
import { TENANT_GENDER_LABELS } from "@/features/properties/schemas";
import { dynamicRoutes } from "@/lib/navigation";
import { cn } from "@/lib/utils";

import { DIET_LABELS, KIND_LABELS, type CatalogListing } from "../listings";

/** A PG in a city's results: photo, who it's for, food, smoking, AC, rent and beds left. */
export function CatalogCard({
  listing,
  station,
  highlighted = false,
  priority = false,
  onHover,
}: {
  listing: CatalogListing;
  /** e.g. "6 min walk to Viman Nagar Metro". */
  station?: string;
  highlighted?: boolean;
  priority?: boolean;
  onHover?: (slug: string | null) => void;
}) {
  const hasAc = listing.sharing.some((option) => option.ac);
  const chips = [
    {
      icon: listing.food.diet === "veg" ? Leaf : UtensilsCrossed,
      text: listing.food.provided ? DIET_LABELS[listing.food.diet!] : "Self-cooking",
    },
    {
      icon: listing.rules.smoking === "not_allowed" ? CigaretteOff : Cigarette,
      text: listing.rules.smoking === "not_allowed" ? "No smoking" : "Smoking OK",
    },
    ...(hasAc ? [{ icon: Snowflake, text: "AC" }] : []),
  ];

  return (
    <article
      onMouseEnter={() => onHover?.(listing.slug)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border transition-shadow hover:shadow-lg",
        highlighted && "ring-2 ring-primary",
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <PropertyPhoto
          src={listing.photos[0]!.url}
          alt={listing.photos[0]!.alt}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
          preload={priority}
          className="transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <span className="absolute top-2 left-2 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {KIND_LABELS[listing.kind]} · {TENANT_GENDER_LABELS[listing.gender]}
        </span>
        <span className="absolute right-2 bottom-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink">
          {listing.photos.length} photos
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-1 text-base leading-snug font-semibold">
          <Link
            href={dynamicRoutes.property(listing.slug)}
            className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
          >
            {listing.title}
          </Link>
        </h3>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {listing.locality}, {listing.city}
          </span>
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {chips.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              <Icon className="size-3" aria-hidden />
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-auto flex flex-wrap items-end justify-between gap-x-2 gap-y-1 pt-1">
          <p className="text-lg font-bold">
            <span className="mr-1 text-sm font-normal text-muted-foreground">from</span>
            <Money amount={listing.price_from} suffix="/mo" />
          </p>
          <p
            className={cn(
              "flex items-center gap-1 text-sm font-medium whitespace-nowrap",
              listing.available_beds > 0 ? "text-success-foreground" : "text-muted-foreground",
            )}
          >
            <BedDouble className="size-4" aria-hidden />
            {listing.available_beds > 0 ? `${listing.available_beds} beds left` : "Full"}
          </p>
        </div>
        {station ? (
          <p className="flex items-center gap-1 text-xs font-medium">
            <TrainFront className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{station}</span>
          </p>
        ) : null}
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="size-3" aria-hidden />
          {listing.best_for}
        </p>
      </div>
    </article>
  );
}
