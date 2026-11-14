import type { Metadata } from "next";
import { Suspense } from "react";

import { CardGridSkeleton } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { GooglePlacesSection } from "@/features/locations/components/google-places-section";
import { OsmHousingSection } from "@/features/locations/components/osm-housing-section";
import { getGooglePlacesForCity, getOsmHousingForCity } from "@/features/locations/service";
import { SearchFilters } from "@/features/properties/components/search-filters";
import { SearchResultsView } from "@/features/properties/components/search-results-view";
import { SearchTransitionProvider } from "@/features/properties/components/search-transition";
import { SectionErrorBoundary } from "@/features/properties/components/section-error-boundary";
import { CATALOG_CITIES, getCatalogCity } from "@/features/catalog/cities";
import { searchCatalog, toSearchResultItem } from "@/features/catalog/listings";
import { straightLineMetres } from "@/features/locations/geo";
import {
  parseSearchFilters,
  SEARCH_PAGE_SIZE,
  type AmenityOption,
  type CityOption,
  type SearchFilters as Filters,
  type SearchResponse,
} from "@/features/properties/schemas";
import { getSearchReferenceData, resolveCity, searchPublicProperties } from "@/features/properties/service";

export const metadata: Metadata = {
  title: "Find a home",
  description: "PGs, hostels, co-living spaces and flats listed by owners on Zovia, with real prices and bed availability.",
};

/**
 * /search (public). The shell is static; filters and results read `searchParams` (runtime data)
 * inside Suspense, and all data comes from cached, cookieless services. Per-user bits (saved
 * hearts) load in the browser.
 */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <SearchTransitionProvider>
      <PageHeader
        title="Find a home"
        description="Real listings from owners: prices, beds and availability as they state them."
      />
      <Suspense fallback={<FiltersSkeleton />}>
        <Filters />
      </Suspense>
      <div className="mt-8">
        <SectionErrorBoundary title="Search didn't load" description="We couldn't load listings. Try again in a moment.">
          <Suspense fallback={<ResultsSkeleton />}>
            <Results searchParams={searchParams} />
          </Suspense>
        </SectionErrorBoundary>
      </div>
      <Suspense fallback={null}>
        <GooglePlaces searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={<OsmHousingSkeleton />}>
        <OsmHousing searchParams={searchParams} />
      </Suspense>
    </SearchTransitionProvider>
  );
}

const FALLBACK_AMENITIES: AmenityOption[] = [
  { code: "wifi", name: "Wi-Fi", category: "basics", icon: "wifi" },
  { code: "ac", name: "AC", category: "comfort", icon: "snowflake" },
  { code: "attached_bathroom", name: "Attached bathroom", category: "comfort", icon: "bath" },
  { code: "laundry", name: "Laundry", category: "services", icon: "shirt" },
  { code: "food", name: "Food", category: "services", icon: "utensils" },
  { code: "power_backup", name: "Power backup", category: "basics", icon: "zap" },
  { code: "housekeeping", name: "Housekeeping", category: "services", icon: "sparkles" },
];

/** Cities and amenities from the database merged with the catalogue's cities; never throws. */
async function referenceData(): Promise<{ cities: CityOption[]; amenities: AmenityOption[] }> {
  let fromDb: { cities: CityOption[]; amenities: AmenityOption[] } = { cities: [], amenities: [] };
  try {
    fromDb = await getSearchReferenceData();
  } catch {
    // Database unreachable: the catalogue still covers every city.
  }
  const cities = [...fromDb.cities];
  for (const city of CATALOG_CITIES) {
    if (!cities.some((known) => known.slug === city.slug)) {
      cities.push({ slug: city.slug, name: city.name, state: city.state, lat: city.lat, lng: city.lng });
    }
  }
  cities.sort((a, b) => a.name.localeCompare(b.name));
  return { cities, amenities: fromDb.amenities.length > 0 ? fromDb.amenities : FALLBACK_AMENITIES };
}

async function Filters() {
  const { cities, amenities } = await referenceData();
  return <SearchFilters cities={cities} amenities={amenities} />;
}

/** Owner listings from the database first, then the Zovia catalogue, one page at a time. */
async function combinedSearch(filters: Filters): Promise<SearchResponse> {
  const limit = SEARCH_PAGE_SIZE;
  let db: SearchResponse | null = null;
  try {
    db = await searchPublicProperties(filters, limit);
  } catch {
    db = null;
  }
  const city = db?.city ?? (filters.city ? resolveCity((await referenceData()).cities, filters.city) : null);
  const origin =
    db?.origin ??
    (filters.lat !== undefined && filters.lng !== undefined
      ? { lat: filters.lat, lng: filters.lng }
      : filters.sort === "distance" && city
        ? { lat: city.lat, lng: city.lng }
        : null);

  const catalog = searchCatalog({
    city: filters.city,
    q: filters.q,
    types: filters.type,
    gender: filters.gender,
    budget_min: filters.budget_min,
    budget_max: filters.budget_max,
    food: filters.food,
  }).map((listing) => {
    const item = toSearchResultItem(listing);
    return origin ? { ...item, distance_m: Math.round(straightLineMetres(origin, { lat: listing.lat, lng: listing.lng })) } : item;
  });
  if (filters.sort === "price_asc") catalog.sort((a, b) => (a.price_from ?? 0) - (b.price_from ?? 0));
  if (filters.sort === "price_desc") catalog.sort((a, b) => (b.price_from ?? 0) - (a.price_from ?? 0));
  if (filters.sort === "distance" && origin) catalog.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

  const dbTotal = db?.total ?? 0;
  const dbItems = db?.items ?? [];
  const offset = (filters.page - 1) * limit;
  const catalogStart = Math.max(0, offset - dbTotal);
  const room = limit - dbItems.length;
  const items = [...dbItems, ...(room > 0 ? catalog.slice(catalogStart, catalogStart + room) : [])];
  return { items, total: dbTotal + catalog.length, page: filters.page, limit, city, origin };
}

async function Results({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const filters = parseSearchFilters(await searchParams);
  const response = await combinedSearch(filters);
  return <SearchResultsView response={response} filters={filters} />;
}

/** Google Maps discovery for the chosen city; renders nothing without GOOGLE_MAPS_API_KEY or a city. */
async function GooglePlaces({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const filters = parseSearchFilters(await searchParams);
  if (!filters.city || getCatalogCity(filters.city)) return null;
  const { cities } = await referenceData();
  const city = resolveCity(cities, filters.city);
  if (!city) return null;
  const section = await getGooglePlacesForCity(city.name).catch(() => ({ status: "disabled" as const }));
  if (section.status === "disabled") return null;
  if (section.status === "error") {
    return (
      <p className="mt-14 border-t border-border pt-10 text-sm text-muted-foreground">
        Places from Google Maps couldn&apos;t load right now.
      </p>
    );
  }
  return <GooglePlacesSection cityName={city.name} places={section.places} />;
}

/** Hostels / PGs mapped on OpenStreetMap, for cities outside the Zovia catalogue (no key needed). */
async function OsmHousing({ searchParams }: Pick<PageProps<"/search">, "searchParams">) {
  const filters = parseSearchFilters(await searchParams);
  if (!filters.city || getCatalogCity(filters.city)) return null;
  const { cities } = await referenceData();
  const city = resolveCity(cities, filters.city);
  if (!city) return null;
  const section = await getOsmHousingForCity({ lat: city.lat, lng: city.lng }).catch(() => ({ status: "error" as const }));
  if (section.status === "error") {
    return (
      <p className="mt-14 border-t border-border pt-10 text-sm text-muted-foreground">
        Hostels and PGs from OpenStreetMap couldn&apos;t load right now. Try again in a minute.
      </p>
    );
  }
  return (
    <OsmHousingSection cityName={city.name} centre={{ lat: city.lat, lng: city.lng }} places={section.places} attribution={section.attribution} />
  );
}

function OsmHousingSkeleton() {
  return (
    <div className="mt-14 space-y-3 border-t border-border pt-10" role="status" aria-label="Loading hostels and PGs">
      <Skeleton className="h-7 w-64" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    </div>
  );
}

function FiltersSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <Skeleton className="h-11 w-full rounded-xl" />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-44 rounded-xl" />
        <Skeleton className="h-11 w-48 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-28 rounded-full" />
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <span className="sr-only">Loading listings</span>
      <div aria-hidden>
        <Skeleton className="mb-4 h-6 w-40" />
        <div className="[&>div]:sm:grid-cols-2 [&>div]:lg:grid-cols-2">
          <CardGridSkeleton count={4} />
        </div>
      </div>
      <Skeleton className="hidden h-[calc(100dvh-8rem)] rounded-2xl lg:block" aria-hidden />
    </div>
  );
}
