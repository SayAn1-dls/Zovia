import "server-only";

import { CATALOG_CITIES, getCatalogCity } from "@/features/catalog/cities";
import {
  AMENITY_LABELS,
  DIET_LABELS,
  GUEST_LABELS,
  KIND_LABELS,
  SHARING_LABELS,
  SMOKING_LABELS,
  allCatalogListings,
  getCatalogListing,
  isCatalogId,
  searchCatalog,
  toSearchResultItem,
  type CatalogListing,
  type CatalogSearch,
} from "@/features/catalog/listings";
import { NEARBY_GROUPS, nearbyForListing } from "@/features/catalog/nearby";

import type { CityRef, LocalityRef } from "./parser";
import type { AssistantPropertyCard } from "./schemas";
import { cardFromSearch } from "./tools";

/**
 * The PG catalogue (every tier 1 and tier 2 city) as the assistant sees it: lookups, compact
 * views for the model, and cards. Catalogue ids look like "catalog:<slug>".
 */

export const CATALOG_CITY_REFS: CityRef[] = CATALOG_CITIES.map((city) => ({
  slug: city.slug,
  name: city.name,
}));
export const CATALOG_LOCALITY_REFS: LocalityRef[] = CATALOG_CITIES.flatMap(
  (city) =>
    city.localities.map((locality) => ({
      name: locality.name,
      city_slug: city.slug,
    })),
);

export function catalogCard(listing: CatalogListing): AssistantPropertyCard {
  return cardFromSearch(toSearchResultItem(listing));
}

/** "catalog:<slug>" or a bare slug -> the listing. */
export function catalogListingById(id: string): CatalogListing | null {
  const slug = isCatalogId(id) ? id.slice("catalog:".length) : id;
  return getCatalogListing(slug.trim().toLowerCase());
}

/** A listing named in free text ("tell me about Shanti Co-living in Hinjawadi"), best match first. */
export function catalogListingsNamed(text: string): CatalogListing[] {
  const lower = text.toLowerCase();
  const named = allCatalogListings().filter((listing) =>
    lower.includes(listing.title.toLowerCase()),
  );
  // The same name can exist in several areas: prefer the ones whose area or city is also mentioned.
  return named.sort((a, b) => score(b) - score(a));
  function score(listing: CatalogListing) {
    return (
      (lower.includes(listing.locality.toLowerCase()) ? 2 : 0) +
      (lower.includes(listing.city.toLowerCase()) ? 1 : 0)
    );
  }
}

export function sortCatalog(
  list: CatalogListing[],
  sort: string | null | undefined,
): CatalogListing[] {
  const copy = [...list];
  if (sort === "price_asc") copy.sort((a, b) => a.price_from - b.price_from);
  else if (sort === "price_desc")
    copy.sort((a, b) => b.price_from - a.price_from);
  else
    copy.sort(
      (a, b) =>
        b.available_beds - a.available_beds || a.price_from - b.price_from,
    );
  return copy;
}

export function searchCatalogSorted(
  filters: CatalogSearch,
  sort?: string | null,
): CatalogListing[] {
  return sortCatalog(searchCatalog(filters), sort);
}

function foodText(listing: CatalogListing): string {
  if (!listing.food.provided)
    return listing.food.kitchen_access
      ? "No meals; shared kitchen for self-cooking"
      : "No meals";
  return `${DIET_LABELS[listing.food.diet!]} meals included (${listing.food.meals.join(", ")})`;
}

/** One line per listing for search results the model reads. */
export function catalogSummaryView(listing: CatalogListing) {
  return {
    id: listing.id,
    title: listing.title,
    type: KIND_LABELS[listing.kind],
    for: listing.gender,
    locality: listing.locality,
    city: listing.city,
    price_from_inr_per_month: listing.price_from,
    rent_by_sharing_inr: Object.fromEntries(
      listing.sharing.map((option) => [option.type, option.rent]),
    ),
    available_beds: listing.available_beds,
    food: foodText(listing),
    smoking: SMOKING_LABELS[listing.rules.smoking],
    ac_rooms: listing.sharing.some((option) => option.ac),
    amenities: listing.amenities,
    sample_listing: true,
  };
}

/** Everything about one catalogue PG, including what is around it. */
export function catalogDetailView(listing: CatalogListing) {
  const nearby = nearbyForListing(listing);
  return {
    id: listing.id,
    title: listing.title,
    type: KIND_LABELS[listing.kind],
    for: listing.gender,
    best_for: listing.best_for,
    address: listing.address,
    locality: listing.locality,
    city: listing.city,
    about: listing.about,
    highlights: listing.highlights,
    furnishing: listing.furnishing,
    rooms: listing.sharing.map((option) => ({
      type: SHARING_LABELS[option.type],
      rent_inr_per_month: option.rent,
      deposit_inr: option.deposit,
      beds_left: option.beds_left,
      ac: option.ac,
      attached_bathroom: option.attached_bathroom,
    })),
    available_beds: listing.available_beds,
    total_beds: listing.total_beds,
    food: foodText(listing),
    house_rules: {
      smoking: SMOKING_LABELS[listing.rules.smoking],
      alcohol: listing.rules.alcohol ? "Allowed" : "Not allowed",
      non_veg_cooking: listing.rules.non_veg_cooking
        ? "Allowed in the kitchen"
        : "Not allowed",
      guests: GUEST_LABELS[listing.rules.guests],
      gate_closes: listing.rules.gate_closes ?? "No curfew",
      pets: listing.rules.pets ? "Allowed" : "Not allowed",
      notice_period_days: listing.rules.notice_days,
    },
    amenities: listing.amenities.map((code) => AMENITY_LABELS[code]),
    nearby: NEARBY_GROUPS.map((group) => ({
      group: group.title,
      places: nearby
        .filter((place) => group.kinds.includes(place.kind))
        .slice(0, 3)
        .map((place) => ({ name: place.name, straight_line_m: place.metres })),
    })).filter((group) => group.places.length > 0),
    sample_listing: true,
    note: "Sample listing from the Zovia catalogue: details are illustrative; the user should confirm on a visit.",
  };
}

/** Monthly and move-in cost for each room type (rent includes meals when food is provided). */
export function catalogCostView(listing: CatalogListing) {
  return {
    id: listing.id,
    title: listing.title,
    by_room_type: listing.sharing.map((option) => ({
      type: SHARING_LABELS[option.type],
      monthly_rent_inr: option.rent,
      move_in_total_inr: option.rent + option.deposit,
      deposit_inr: option.deposit,
    })),
    included_in_rent: [
      ...(listing.food.provided ? ["meals"] : []),
      ...listing.amenities
        .filter((code) =>
          ["wifi", "housekeeping", "laundry", "power_backup"].includes(code),
        )
        .map((code) => AMENITY_LABELS[code]),
    ],
    notes: [
      "Electricity for AC rooms is often billed separately by meter; confirm with the owner.",
    ],
  };
}

/** Rent picture of a city (or one of its areas) from the catalogue. */
export function catalogRentStats(citySlug: string, locality?: string | null) {
  const city = getCatalogCity(citySlug);
  if (!city) return null;
  const list = searchCatalog({
    city: city.slug,
    locality: locality ?? undefined,
  });
  if (list.length === 0) return null;
  const prices = list
    .map((listing) => listing.price_from)
    .sort((a, b) => a - b);
  const byArea = new Map<string, number[]>();
  for (const listing of list)
    byArea.set(listing.locality, [
      ...(byArea.get(listing.locality) ?? []),
      listing.price_from,
    ]);
  const areas = [...byArea.entries()]
    .map(([name, values]) => ({ name, from: Math.min(...values) }))
    .sort((a, b) => a.from - b.from);
  return {
    city: city.name,
    locality: locality ?? null,
    count: list.length,
    min: prices[0]!,
    max: prices[prices.length - 1]!,
    median: prices[Math.floor(prices.length / 2)]!,
    cheapest_areas: areas.slice(0, 3),
    veg_count: list.filter((listing) => listing.food.diet === "veg").length,
    smoke_free_count: list.filter(
      (listing) => listing.rules.smoking === "not_allowed",
    ).length,
  };
}
