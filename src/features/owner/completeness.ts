import type { OwnerPropertyDetail } from "./schemas";

/**
 * What a listing still needs before review (pure; unit-tested). Mirrors the checks inside
 * submit_property_for_review() so the owner gets the checklist even though that function
 * currently fails with "malformed array literal" whenever something is missing (the
 * `text[] || 'literal'` bug reported to the database owner). The SQL function stays the
 * enforcer: it is still called, and re-checks everything, once this list is empty.
 */
export function listingGaps(
  property: Pick<
    OwnerPropertyDetail,
    "description" | "city" | "locality" | "address_line" | "location" | "media" | "listing_mode" | "rooms" | "monthly_rent" | "availability"
  >,
): string[] {
  const missing: string[] = [];
  if (!property.description || property.description.length < 30) missing.push("description");
  if (!property.city || !property.locality || !property.address_line) missing.push("address");
  if (!property.location) missing.push("map_pin");
  if (property.media.length === 0) missing.push("photos");
  if (property.listing_mode === "per_bed") {
    if (!property.rooms.some((room) => room.beds.length > 0)) missing.push("beds");
  } else {
    if (property.monthly_rent === null) missing.push("rent");
    if (!property.availability) missing.push("availability");
  }
  return missing;
}
