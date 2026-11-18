import { getCatalogListing } from "@/features/catalog/listings";

import type { StayBookingRow } from "./ports";
import type { StayBooking } from "./schemas";

/**
 * A stored booking plus what the screens and e-mails show about the place (title, city, locality),
 * from the catalogue. An unknown listing keeps its slug as the title.
 */
export function enrichBooking(row: StayBookingRow, getListing = getCatalogListing): StayBooking {
  const listing = getListing(row.listing);
  return {
    ...row,
    listing_title: listing?.title ?? row.listing,
    city: listing?.city ?? "",
    locality: listing?.locality ?? "",
  };
}
