import { CATALOG_CITIES } from "@/features/catalog/cities";
import { searchCatalog, toSearchResultItem } from "@/features/catalog/listings";
import { straightLineMetres } from "@/features/locations/geo";
import {
  parseSearchFilters,
  SEARCH_PAGE_SIZE,
  type SearchResponse,
} from "@/features/properties/schemas";
import {
  resolveCity,
  searchPublicProperties,
} from "@/features/properties/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/properties/search: published listings. Query parameters are the /search URL
 * filters (city, q, type[], budget_min, budget_max, gender, food, amenities[], furnishing,
 * available_only, sort, page, lat, lng). Unknown or out-of-range values are ignored, not
 * rejected. Public and cookieless; `distance_m` is straight-line.
 */
export const GET = createHandler(
  { auth: "public", rateLimit: "search", label: "properties.search" },
  async ({ request }) => {
    const url = new URL(request.url);
    const raw: Record<string, string | string[]> = {};
    for (const key of new Set(url.searchParams.keys())) {
      const values = url.searchParams.getAll(key);
      raw[key] = values.length > 1 ? values : (values[0] ?? "");
    }
    const filters = parseSearchFilters(raw);
    const limit = SEARCH_PAGE_SIZE;
    let db: SearchResponse | null = null;
    try {
      db = await searchPublicProperties(filters, limit);
    } catch {
      db = null;
    }

    const catalogCities = CATALOG_CITIES.map((c) => ({
      slug: c.slug,
      name: c.name,
      state: c.state,
      lat: c.lat,
      lng: c.lng,
    }));
    const city =
      db?.city ??
      (filters.city ? resolveCity(catalogCities, filters.city) : null);
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
      amenities: filters.amenities,
      furnishing: filters.furnishing,
      available_only: filters.available_only,
    }).map((listing) => {
      const item = toSearchResultItem(listing);
      return origin
        ? {
            ...item,
            distance_m: Math.round(
              straightLineMetres(origin, {
                lat: listing.lat,
                lng: listing.lng,
              }),
            ),
          }
        : item;
    });
    if (filters.sort === "price_asc")
      catalog.sort((a, b) => (a.price_from ?? 0) - (b.price_from ?? 0));
    if (filters.sort === "price_desc")
      catalog.sort((a, b) => (b.price_from ?? 0) - (a.price_from ?? 0));
    if (filters.sort === "distance" && origin)
      catalog.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));

    const dbTotal = db?.total ?? 0;
    const dbItems = db?.items ?? [];
    const offset = (filters.page - 1) * limit;
    const catalogStart = Math.max(0, offset - dbTotal);
    const room = limit - dbItems.length;
    const items = [
      ...dbItems,
      ...(room > 0 ? catalog.slice(catalogStart, catalogStart + room) : []),
    ];
    const total = dbTotal + catalog.length;

    return ok(
      { items, city, origin },
      {
        meta: {
          page: filters.page,
          limit,
          total,
          has_more: filters.page * limit < total,
        },
        // Public and cookieless: identical queries are served from the CDN for 30 s (and stale
        // for 2 more minutes while it refreshes), so a traffic spike mostly never reaches us.
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120",
        },
      },
    );
  },
);
