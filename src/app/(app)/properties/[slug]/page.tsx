import { MapPin, Users, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { Money } from "@/components/money";
import { RatingStars } from "@/components/rating-stars";
import { BookingCard } from "@/features/bookings/components/booking-card";
import { CatalogListingView } from "@/features/catalog/components/catalog-listing-view";
import { getCatalogListing, similarCatalogListings } from "@/features/catalog/listings";
import { nearbyForListing } from "@/features/catalog/nearby";
import { MapView } from "@/features/locations/components/map-view";
import { NearbyPlaces } from "@/features/locations/components/nearby-places";
import { InquiryForm } from "@/features/properties/components/inquiry-form";
import {
  AmenitiesList,
  AvailabilitySummary,
  DetailSection,
  FoodSummary,
  HouseRules,
  ReviewsList,
  RoomsList,
  TrustBadges,
  TrustExplainer,
} from "@/features/properties/components/listing-sections";
import { OwnerContactCard } from "@/features/properties/components/owner-contact-card";
import { PhotoGallery } from "@/features/properties/components/photo-gallery";
import { PriceBreakdown } from "@/features/properties/components/price-breakdown";
import { SaveButton } from "@/features/properties/components/save-button";
import { pricePrefix } from "@/features/properties/presenters";
import {
  FURNISHING_LABELS,
  PROPERTY_TYPE_LABELS,
  TENANT_GENDER_LABELS,
  type PropertyDetail,
} from "@/features/properties/schemas";
import { getPublicPropertyBySlug } from "@/features/properties/service";

/**
 * /properties/[slug] (public). `params` is runtime data, so everything listing-specific renders
 * inside Suspense from the cached, cookieless `getPublicPropertyBySlug`. Saved state, contact
 * reveal, enquiries and nearby places load in the browser.
 */

/** A database listing, or null when it doesn't exist or the database can't be reached. */
async function findProperty(slug: string): Promise<PropertyDetail | null> {
  try {
    return await getPublicPropertyBySlug(slug);
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps<"/properties/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const listing = getCatalogListing(slug);
  if (listing) {
    const description = `${listing.title}, ${listing.locality}, ${listing.city}. From ₹${listing.price_from.toLocaleString("en-IN")}/month. ${listing.about.slice(0, 120)}`;
    return {
      title: `${listing.title}, ${listing.locality}`,
      description,
      alternates: { canonical: `/properties/${listing.slug}` },
      openGraph: { title: listing.title, description, type: "website", images: [{ url: listing.photos[0]!.url, alt: listing.photos[0]!.alt }] },
    };
  }
  const property = await findProperty(slug);
  if (!property) return { title: "Listing not found", robots: { index: false } };
  const place = [property.locality, property.city].filter(Boolean).join(", ");
  const price =
    property.min_rent !== null
      ? `${pricePrefix(property.listing_mode) ? "From " : ""}₹${property.min_rent.toLocaleString("en-IN")}/month. `
      : "";
  const description = `${PROPERTY_TYPE_LABELS[property.property_type]}${place ? ` in ${place}` : ""}. ${price}${
    property.description?.slice(0, 140) ?? ""
  }`.trim();
  const cover = property.photos[0];
  return {
    title: property.title,
    description,
    alternates: { canonical: `/properties/${property.slug}` },
    openGraph: {
      title: property.title,
      description,
      type: "website",
      images: cover ? [{ url: cover.url, alt: cover.alt }] : undefined,
    },
  };
}

export default function PropertyPage({ params }: PageProps<"/properties/[slug]">) {
  return (
    <Suspense fallback={<LoadingState variant="detail" label="Loading listing" />}>
      {params.then(({ slug }) => (
        <PropertyContent slug={slug} />
      ))}
    </Suspense>
  );
}

async function PropertyContent({ slug }: { slug: string }) {
  const listing = getCatalogListing(slug);
  if (listing) {
    return <CatalogListingView listing={listing} similar={similarCatalogListings(listing)} nearby={nearbyForListing(listing)} />;
  }
  const property = await findProperty(slug);
  if (!property) notFound();
  return <PropertyView property={property} />;
}

function PropertyView({ property }: { property: PropertyDetail }) {
  const place = [property.locality, property.city].filter(Boolean).join(", ");
  const address = [property.address_line, property.landmark && `near ${property.landmark}`, property.locality, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const facts = [
    PROPERTY_TYPE_LABELS[property.property_type],
    TENANT_GENDER_LABELS[property.tenant_gender],
    property.furnishing ? FURNISHING_LABELS[property.furnishing] : null,
  ].filter(Boolean) as string[];

  return (
    <article>
      <header className="mb-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-display-md font-extrabold break-words">{property.title}</h1>
            {place ? (
              <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-4 shrink-0" aria-hidden />
                {place}
              </p>
            ) : null}
          </div>
          <SaveButton propertyId={property.id} title={property.title} variant="inline" className="self-start" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {property.rating_count > 0 ? <RatingStars value={property.rating_avg} count={property.rating_count} /> : null}
          <TrustBadges trust={property.trust} />
        </div>
      </header>

      <PhotoGallery photos={property.photos} title={property.title} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section aria-label="Summary" className="pb-8">
            <p className="flex flex-wrap gap-x-2 text-base font-medium">
              {facts.map((fact, index) => (
                <span key={fact}>
                  {index > 0 ? <span className="mr-2 text-muted-foreground">·</span> : null}
                  {fact}
                </span>
              ))}
            </p>
            {property.description ? (
              <p className="mt-4 leading-relaxed whitespace-pre-line text-foreground/90">{property.description}</p>
            ) : null}
          </section>

          <DetailSection id="availability" title="Availability">
            <AvailabilitySummary property={property} />
          </DetailSection>

          <DetailSection id="price" title="What you'll pay">
            <PriceBreakdown listing={property} />
          </DetailSection>

          {property.listing_mode === "per_bed" || property.rooms.length > 0 ? (
            <DetailSection id="rooms" title="Rooms and beds">
              <RoomsList property={property} />
            </DetailSection>
          ) : null}

          <DetailSection id="amenities" title="Amenities">
            <AmenitiesList property={property} />
            <div className="mt-6 flex items-start gap-3">
              <UtensilsCrossed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <FoodSummary property={property} />
            </div>
          </DetailSection>

          <DetailSection id="rules" title="House rules">
            <HouseRules property={property} />
          </DetailSection>

          <DetailSection id="location" title="Location">
            {address ? <p className="mb-4 text-sm">{address}</p> : null}
            {property.location ? (
              <>
                <MapView
                  center={property.location}
                  zoom={15}
                  markers={[{ id: property.id, lat: property.location.lat, lng: property.location.lng, title: property.title }]}
                  label={`Map showing ${property.title}`}
                  className="h-72 sm:h-96"
                />
                <h3 className="mt-8 mb-4 text-lg font-semibold">Nearby</h3>
                <NearbyPlaces point={property.location} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">The owner hasn&apos;t placed this listing on the map.</p>
            )}
          </DetailSection>

          <DetailSection id="reviews" title="Reviews">
            <ReviewsList property={property} />
          </DetailSection>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start" aria-label="Contact and booking">
          <div className="space-y-6 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6">
            <div>
              {property.min_rent !== null ? (
                <p className="text-2xl font-bold">
                  {pricePrefix(property.listing_mode) ? (
                    <span className="mr-1 text-base font-normal text-muted-foreground">from</span>
                  ) : null}
                  <Money amount={property.min_rent} suffix="/month" />
                </p>
              ) : (
                <p className="text-muted-foreground">Rent not listed yet</p>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Users className="size-4" aria-hidden />
                {TENANT_GENDER_LABELS[property.tenant_gender]}
              </p>
            </div>
            <BookingCard
              propertyId={property.id}
              slug={property.slug}
              listingMode={property.listing_mode}
              beds={property.rooms.flatMap((room) =>
                room.beds
                  .filter((bed) => bed.status === "available" && (bed.rent_override ?? room.rent_per_bed) !== null)
                  .map((bed) => ({
                    id: bed.id,
                    label: bed.label,
                    room_name: room.name,
                    rent: (bed.rent_override ?? room.rent_per_bed) as number,
                    deposit: room.security_deposit,
                    available_from: bed.available_from,
                  })),
              )}
              monthlyRent={property.monthly_rent}
              securityDeposit={property.security_deposit}
              unitAvailable={["available", "limited", "coming_soon"].includes(property.availability?.status ?? "")}
            />
            <div>
              <h2 className="mb-3 text-base font-semibold">Send an enquiry</h2>
              <InquiryForm
                propertyId={property.id}
                slug={property.slug}
                rooms={property.rooms.map(({ id, name }) => ({ id, name }))}
              />
            </div>
            <div className="border-t border-border pt-6">
              <h2 className="mb-3 text-base font-semibold">Owner</h2>
              <OwnerContactCard owner={property.owner} propertyId={property.id} slug={property.slug} />
            </div>
            <div className="border-t border-border pt-6">
              <h2 className="mb-3 text-base font-semibold">Trust</h2>
              <TrustExplainer trust={property.trust} />
            </div>
          </div>
        </aside>
      </div>
    </article>
  );
}
