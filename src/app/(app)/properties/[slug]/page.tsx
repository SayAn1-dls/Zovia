import { BedDouble, Building2, type LucideIcon, MapPin, MessageCircle, Sofa, Users, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingState } from "@/components/feedback/loading-state";
import { Money } from "@/components/money";
import { RatingStars } from "@/components/rating-stars";
import { BookingCard } from "@/features/bookings/components/booking-card";
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
import { ShareButton } from "@/features/properties/components/share-button";
import { bedAvailabilityLabel, pricePrefix } from "@/features/properties/presenters";
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

export async function generateMetadata({ params }: PageProps<"/properties/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const property = await getPublicPropertyBySlug(slug);
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
  const property = await getPublicPropertyBySlug(slug);
  if (!property) notFound();
  return <PropertyView property={property} />;
}

function PropertyView({ property }: { property: PropertyDetail }) {
  const place = [property.locality, property.city].filter(Boolean).join(", ");
  const address = [property.address_line, property.landmark && `near ${property.landmark}`, property.locality, property.city, property.state, property.pincode]
    .filter(Boolean)
    .join(", ");
  const facts: { icon: LucideIcon; label: string }[] = [
    { icon: Building2, label: PROPERTY_TYPE_LABELS[property.property_type] },
    { icon: Users, label: TENANT_GENDER_LABELS[property.tenant_gender] },
    ...(property.furnishing ? [{ icon: Sofa, label: FURNISHING_LABELS[property.furnishing] }] : []),
    ...(property.listing_mode === "per_bed" && property.total_beds > 0
      ? [{ icon: BedDouble, label: bedAvailabilityLabel(property.available_beds, property.total_beds) }]
      : []),
  ];

  return (
    <article>
      <header className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-display-sm font-extrabold break-words sm:text-display-md">{property.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {property.rating_count > 0 ? <RatingStars value={property.rating_avg} count={property.rating_count} /> : null}
            {place ? (
              <span className="flex items-center gap-1.5 font-medium">
                <MapPin className="size-4 shrink-0" aria-hidden />
                <a href="#location" className="underline underline-offset-4">
                  {place}
                </a>
              </span>
            ) : null}
            <TrustBadges trust={property.trust} />
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <ShareButton title={property.title} />
          <SaveButton propertyId={property.id} title={property.title} variant="inline" />
        </div>
      </header>

      <PhotoGallery photos={property.photos} title={property.title} />

      <div className="mt-8 grid gap-x-16 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-label="Summary" className="min-w-0 pb-8 lg:col-start-1">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {facts.map((fact) => (
              <li key={fact.label} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
                <fact.icon className="size-5" aria-hidden />
                <span className="text-sm leading-tight font-semibold">{fact.label}</span>
              </li>
            ))}
          </ul>
          {property.description ? (
            <p className="mt-6 max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">{property.description}</p>
          ) : null}
        </section>

        <aside
          id="book"
          aria-label="Booking"
          className="mb-8 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mb-0 lg:self-start"
        >
          <div className="rounded-3xl border border-border bg-card p-5 shadow-xl sm:p-6">
            <div className="mb-4">
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
            </div>
            <div className="[&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0 [&>section]:shadow-none">
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
            </div>
            <a
              href="#owner"
              className="mt-4 flex min-h-11 items-center justify-center gap-2 border-t border-border pt-4 text-sm font-semibold underline-offset-4 hover:underline"
            >
              <MessageCircle className="size-4" aria-hidden />
              Ask the owner
            </a>
          </div>
        </aside>

        <div className="min-w-0 lg:col-start-1">
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

          <DetailSection id="amenities" title="What this place offers">
            <AmenitiesList property={property} />
            <div className="mt-6 flex items-start gap-3">
              <UtensilsCrossed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
              <FoodSummary property={property} />
            </div>
          </DetailSection>

          <DetailSection id="rules" title="House rules">
            <HouseRules property={property} />
          </DetailSection>

          <DetailSection id="owner" title="Meet the owner" className="scroll-mt-24">
            <div className="grid gap-8 sm:grid-cols-2">
              <div className="space-y-6">
                <OwnerContactCard owner={property.owner} propertyId={property.id} slug={property.slug} />
                <TrustExplainer trust={property.trust} />
              </div>
              <div>
                <h3 className="mb-3 text-base font-semibold">Send an enquiry</h3>
                <InquiryForm
                  propertyId={property.id}
                  slug={property.slug}
                  rooms={property.rooms.map(({ id, name }) => ({ id, name }))}
                />
              </div>
            </div>
          </DetailSection>
        </div>
      </div>

      <DetailSection id="location" title="Where you'll be" className="scroll-mt-24">
        {address ? <p className="-mt-2 mb-4 text-sm text-muted-foreground">{address}</p> : null}
        {property.location ? (
          <>
            <div className="overflow-hidden rounded-3xl ring-1 ring-border">
              <MapView
                center={property.location}
                zoom={15}
                markers={[{ id: property.id, lat: property.location.lat, lng: property.location.lng, title: property.title }]}
                label={`Map showing ${property.title}`}
                className="h-80 sm:h-[420px]"
              />
            </div>
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
    </article>
  );
}
