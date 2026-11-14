import { BedDouble, Building2, IndianRupee, MapPin } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Money } from "@/components/money";
import { Skeleton } from "@/components/ui/skeleton";
import { CATALOG_CITIES, getCatalogCity, type CatalogCity } from "@/features/catalog/cities";
import { CityBrowser } from "@/features/catalog/components/city-browser";
import { catalogListingsForCity } from "@/features/catalog/listings";
import { nearbyForListing } from "@/features/catalog/nearby";

export function generateStaticParams() {
  return CATALOG_CITIES.map((city) => ({ slug: city.slug }));
}

export async function generateMetadata({ params }: PageProps<"/cities/[slug]">): Promise<Metadata> {
  const city = getCatalogCity((await params).slug);
  if (!city) return { title: "City not found", robots: { index: false } };
  return {
    title: `PGs and hostels in ${city.name}`,
    description: `Compare PGs, hostels and co-living in ${city.name}: photos, rent by sharing, veg / non-veg food, smoking rules, amenities and nearby places.`,
    alternates: { canonical: `/cities/${city.slug}` },
    openGraph: { images: [{ url: city.photo }] },
  };
}

/** /cities/[slug]: every PG in a city with filters (type, food, smoking, sharing, budget ...) and a price map. */
export default function CityPage({ params }: PageProps<"/cities/[slug]">) {
  return (
    <Suspense fallback={<CitySkeleton />}>
      {params.then(({ slug }) => {
        const city = getCatalogCity(slug);
        if (!city) notFound();
        return <CityContent city={city} />;
      })}
    </Suspense>
  );
}

function CityContent({ city }: { city: CatalogCity }) {
  const listings = catalogListingsForCity(city.slug);
  // Nearest metro / railway station per PG, for the "8 min to ..." line on each card.
  const stations: Record<string, string> = {};
  for (const listing of listings) {
    const station = nearbyForListing(listing).find((place) => place.kind === "metro_station" || place.kind === "railway_station");
    if (station && station.metres < 4000) {
      stations[listing.slug] = `${station.metres < 1000 ? `${Math.max(1, Math.round(station.metres / 80))} min walk` : `${(station.metres / 1000).toFixed(1)} km`} to ${station.name}`;
    }
  }
  const stats = [
    { icon: Building2, label: "Places", value: listings.length },
    { icon: IndianRupee, label: "Rent from", value: <Money amount={Math.min(...listings.map((l) => l.price_from))} suffix="/mo" /> },
    { icon: BedDouble, label: "Beds free", value: listings.reduce((sum, l) => sum + l.available_beds, 0) },
    { icon: MapPin, label: "Areas", value: city.localities.length },
  ];
  return (
    <>
      <header className="relative -mt-2 overflow-hidden rounded-3xl bg-ink">
        <Image src={city.photo} alt="" fill priority sizes="100vw" className="object-cover opacity-60" />
        <div className="relative px-6 py-10 text-white sm:px-10 sm:py-14">
          <p className="text-sm font-semibold text-white/80">{city.state} · Tier {city.tier}</p>
          <h1 className="mt-1 text-display-lg font-extrabold">PGs in {city.name}</h1>
          <p className="mt-3 max-w-xl text-white/85">{city.blurb}</p>
          <dl className="mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl bg-white/12 p-3 backdrop-blur-sm">
                <dt className="flex items-center gap-1.5 text-xs text-white/75">
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </dt>
                <dd className="mt-0.5 text-lg font-bold [&_span]:text-white/75">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </header>

      <div className="mt-6">
        <CityBrowser cityName={city.name} centre={{ lat: city.lat, lng: city.lng }} listings={listings} stations={stations} />
      </div>

    </>
  );
}

function CitySkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading city">
      <Skeleton className="h-64 rounded-3xl" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
