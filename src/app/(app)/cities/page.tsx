import { ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { Money } from "@/components/money";
import { CATALOG_CITIES, type CatalogCity } from "@/features/catalog/cities";
import { catalogListingsForCity } from "@/features/catalog/listings";
import { dynamicRoutes } from "@/lib/navigation";

export const metadata: Metadata = {
  title: "PGs and hostels by city",
  description: "PGs, hostels and co-living in every tier 1 and tier 2 city in India: photos, rent, food, house rules and what's nearby.",
  alternates: { canonical: "/cities" },
};

function CityTile({ city }: { city: CatalogCity }) {
  const listings = catalogListingsForCity(city.slug);
  const from = Math.min(...listings.map((listing) => listing.price_from));
  return (
    <Link href={dynamicRoutes.city(city.slug)} className="group block overflow-hidden rounded-2xl bg-card ring-1 ring-border transition-shadow hover:shadow-lg">
      <div className="relative aspect-[16/10] overflow-hidden bg-ink">
        <Image
          src={city.photo}
          alt=""
          fill
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover opacity-90 transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span className="absolute bottom-3 left-3 text-lg font-bold text-white">{city.name}</span>
      </div>
      <div className="flex items-center justify-between gap-2 p-3.5 text-sm">
        <span className="text-muted-foreground">
          {listings.length} places · from <Money amount={from} className="font-semibold text-foreground" />
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-foreground" aria-hidden />
      </div>
    </Link>
  );
}

/** /cities: every city Zovia covers, tier 1 first. */
export default function CitiesPage() {
  const tiers = [
    { title: "Metro and tier 1 cities", cities: CATALOG_CITIES.filter((city) => city.tier === 1) },
    { title: "Tier 2 cities", cities: CATALOG_CITIES.filter((city) => city.tier === 2) },
  ];
  return (
    <>
      <PageHeader title="Pick your city" description="PGs, hostels and co-living with photos, rent, food, house rules and what's nearby." />
      {tiers.map((tier) => (
        <section key={tier.title} aria-labelledby={`tier-${tier.cities[0]!.tier}`} className="mt-8">
          <h2 id={`tier-${tier.cities[0]!.tier}`} className="mb-4 text-xl font-bold tracking-tight">
            {tier.title}
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tier.cities.map((city) => (
              <li key={city.slug}>
                <CityTile city={city} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
