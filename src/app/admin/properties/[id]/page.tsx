import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { z } from "zod";

import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { ReviewDecision } from "@/features/admin/components/review-decision";
import { getListing, staffPageContext } from "@/features/admin/service";
import { formatDateTime, formatINR, formatINRRange } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";
import { isAppError } from "@/server/http/errors";

export const metadata: Metadata = { title: "Review listing", robots: { index: false } };

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

const human = (value: string | null | undefined) => (value ? value.replace(/_/g, " ") : "—");

export default function AdminListingPage({ params }: PageProps<"/admin/properties/[id]">) {
  return (
    <Suspense fallback={<LoadingState variant="detail" label="Loading listing" />}>
      <ListingBody params={params} />
    </Suspense>
  );
}

async function ListingBody({ params }: { params: PageProps<"/admin/properties/[id]">["params"] }) {
  const ctx = await staffPageContext();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  let listing;
  try {
    listing = await getListing(ctx, id);
  } catch (error) {
    if (isAppError(error) && error.code === "not_found") notFound();
    throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader back={{ href: routes.adminProperties, label: "Listings" }} title={listing.title} />

      <section className="space-y-4 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5" aria-label="Decision">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge status={listing.status} />
          {listing.submitted_at ? <span className="text-muted-foreground">Submitted {formatDateTime(listing.submitted_at)}</span> : null}
          {listing.status === "published" ? (
            <Link href={dynamicRoutes.property(listing.slug)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              <ExternalLink data-icon="inline-start" aria-hidden />
              Public page
            </Link>
          ) : null}
        </div>
        {listing.rejection_reason ? (
          <p className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
            <span className="font-semibold">Last rejection: </span>
            {listing.rejection_reason}
          </p>
        ) : null}
        <ReviewDecision propertyId={listing.id} status={listing.status} />
      </section>

      <Card title={`Photos (${listing.photos.length})`}>
        {listing.photos.length ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {listing.photos.map((photo, index) => (
              <li key={photo.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                {/* Owner upload from the public bucket. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={`Photo ${index + 1}`} className="size-full object-cover" loading="lazy" />
                {photo.is_cover ? <span className="absolute top-2 left-2 rounded-full bg-lime px-2 py-0.5 text-xs font-semibold text-ink">Cover</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No photos.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Listing">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Type">{human(listing.property_type)}</Fact>
            <Fact label="Let as">{listing.listing_mode === "per_bed" ? "Rooms and beds" : "Entire unit"}</Fact>
            <Fact label="Who can stay">{human(listing.tenant_gender)}</Fact>
            <Fact label="Furnishing">{human(listing.furnishing)}</Fact>
            <div className="col-span-2">
              <Fact label="Address">{listing.address || "—"}</Fact>
            </div>
            <div className="col-span-2">
              <Fact label="Map pin">
                {listing.location ? (
                  <a
                    className="underline underline-offset-4"
                    href={`https://www.openstreetmap.org/?mlat=${listing.location.lat}&mlon=${listing.location.lng}#map=18/${listing.location.lat}/${listing.location.lng}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {listing.location.lat.toFixed(5)}, {listing.location.lng.toFixed(5)} (open map)
                  </a>
                ) : (
                  "Not pinned"
                )}
              </Fact>
            </div>
          </dl>
          <h3 className="mt-5 text-sm font-semibold">Description</h3>
          <p className="mt-1 text-sm whitespace-pre-line">{listing.description ?? "—"}</p>
        </Card>

        <Card title="Owner">
          {listing.owner ? (
            <dl className="grid grid-cols-2 gap-4">
              <Fact label="Name">{listing.owner.display_name}</Fact>
              <Fact label="Owner type">{human(listing.owner.owner_type)}</Fact>
              <Fact label="E-mail">{listing.owner.email ?? "—"}</Fact>
              <Fact label="Phone">{listing.owner.contact_phone ?? "—"}</Fact>
              <Fact label="Verification">
                <StatusBadge status={listing.owner.verification_status} />
              </Fact>
              <Fact label="Owner since">{formatDateTime(listing.owner.member_since)}</Fact>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Owner record not found.</p>
          )}
        </Card>

        <Card title="Pricing">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Rent">
              {listing.listing_mode === "entire_unit" ? formatINR(listing.monthly_rent) : `${formatINRRange(listing.min_rent, listing.max_rent)} per bed`}
            </Fact>
            <Fact label="Deposit">{formatINR(listing.security_deposit)}</Fact>
            <Fact label="Maintenance">{formatINR(listing.maintenance_monthly)}</Fact>
            <Fact label="Electricity">
              {human(listing.electricity_billing)}
              {listing.electricity_monthly_estimate !== null ? ` · ${formatINR(listing.electricity_monthly_estimate)}` : ""}
            </Fact>
            <Fact label="Water">
              {human(listing.water_billing)}
              {listing.water_monthly_estimate !== null ? ` · ${formatINR(listing.water_monthly_estimate)}` : ""}
            </Fact>
            <Fact label="Food">
              {!listing.food_available ? "Not available" : listing.food_included ? "Included" : `Optional · ${formatINR(listing.food_monthly_charge)}`}
            </Fact>
          </dl>
          {listing.charges.length ? (
            <ul className="mt-4 space-y-1 text-sm">
              {listing.charges.map((charge, index) => (
                <li key={index}>
                  {charge.label}: {formatINR(charge.amount)} ({human(charge.frequency)}
                  {charge.is_mandatory ? ", mandatory" : ", optional"})
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title={listing.listing_mode === "per_bed" ? `Rooms and beds (${listing.available_beds} of ${listing.total_beds} available)` : "Availability"}>
          {listing.listing_mode === "per_bed" ? (
            listing.rooms.length ? (
              <ul className="space-y-3 text-sm">
                {listing.rooms.map((room) => (
                  <li key={room.id}>
                    <p className="font-semibold">
                      {room.name} · {room.capacity} beds · {formatINR(room.rent_per_bed)} per bed
                    </p>
                    <p className="text-muted-foreground">{room.beds.map((bed) => `${bed.label}: ${bed.status}`).join(" · ") || "No beds"}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No rooms.</p>
            )
          ) : (
            <p className="text-sm">
              {listing.availability ? (
                <>
                  <StatusBadge status={listing.availability.status} />{" "}
                  {listing.availability.available_from ? `from ${listing.availability.available_from}` : ""}
                </>
              ) : (
                "—"
              )}
            </p>
          )}
        </Card>

        <Card title="Amenities and rules">
          <p className="text-sm">{listing.amenities.length ? listing.amenities.join(", ") : "No amenities listed."}</p>
          {listing.rules.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {listing.rules.map((rule) => (
                <li key={rule.rule_code}>
                  {human(rule.rule_code)}: {rule.allowed === true ? "allowed" : rule.allowed === false ? "not allowed" : (rule.value ?? rule.note ?? "—")}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
