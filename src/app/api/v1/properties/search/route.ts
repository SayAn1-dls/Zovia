import { parseSearchFilters, SEARCH_PAGE_SIZE } from "@/features/properties/schemas";
import { searchPublicProperties } from "@/features/properties/service";
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
    const result = await searchPublicProperties(parseSearchFilters(raw), SEARCH_PAGE_SIZE);
    return ok(
      { items: result.items, city: result.city, origin: result.origin },
      {
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          has_more: result.page * result.limit < result.total,
        },
      },
    );
  },
);
