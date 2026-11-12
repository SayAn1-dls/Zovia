import { Building2, ImageOff } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/feedback/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { formatINRRange, pluralize } from "@/lib/format";
import { dynamicRoutes, routes } from "@/lib/navigation";

import { PROPERTY_TYPE_LABELS, type OwnerPropertySummary } from "../schemas";
import { ListingActions } from "./listing-actions";

function price(property: OwnerPropertySummary): string {
  if (property.listing_mode === "entire_unit") return property.monthly_rent === null ? "Rent not set" : `${formatINRRange(property.monthly_rent, property.monthly_rent)}/month`;
  if (property.min_rent === null) return "No rooms priced yet";
  return `${formatINRRange(property.min_rent, property.max_rent)} per bed`;
}

/** The owner's listings with status, rejection reason and lifecycle actions. */
export function PropertyList({ properties }: { properties: OwnerPropertySummary[] }) {
  if (properties.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No listings yet"
        description="Add your first property. You can save it as a draft and finish it later."
        action={
          <Link href={routes.ownerNewProperty} className={buttonVariants({ size: "lg" })}>
            Add a property
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-4" aria-label="Your listings">
      {properties.map((property) => (
        <li key={property.id} className="overflow-hidden rounded-2xl bg-card ring-1 ring-border" data-testid="owner-property">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
            <Link
              href={dynamicRoutes.ownerProperty(property.id)}
              className="relative aspect-[4/3] w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:w-44"
              aria-label={`Edit ${property.title}`}
            >
              {property.cover_url ? (
                // Owner's own upload from the public bucket; unoptimised keeps local Storage working.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={property.cover_url} alt="" className="size-full object-cover" loading="lazy" />
              ) : (
                <span className="flex size-full items-center justify-center text-muted-foreground">
                  <ImageOff className="size-6" aria-hidden />
                  <span className="sr-only">No photo yet</span>
                </span>
              )}
            </Link>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={property.status} />
                <span className="text-xs font-medium text-muted-foreground">{PROPERTY_TYPE_LABELS[property.property_type]}</span>
              </div>
              <h2 className="text-lg font-bold break-words text-foreground">
                <Link href={dynamicRoutes.ownerProperty(property.id)} className="hover:underline">
                  {property.title}
                </Link>
              </h2>
              <p className="text-sm text-muted-foreground">
                {[property.locality, property.city].filter(Boolean).join(", ") || "Address not added yet"}
              </p>
              <p className="text-sm font-medium text-foreground">
                {price(property)}
                {property.listing_mode === "per_bed" ? (
                  <span className="font-normal text-muted-foreground">
                    {" · "}
                    {property.available_beds} of {pluralize(property.total_beds, "bed")} available
                  </span>
                ) : null}
              </p>
              {property.status === "rejected" && property.rejection_reason ? (
                <p className="rounded-xl bg-danger-surface px-3 py-2 text-sm text-danger-foreground">
                  <span className="font-semibold">Reason: </span>
                  {property.rejection_reason}
                </p>
              ) : null}
              {property.status === "pending_review" ? (
                <p className="text-sm text-muted-foreground">Our team is reviewing it. You will get a notification when it is decided.</p>
              ) : null}
            </div>
          </div>
          {property.status !== "archived" ? (
            <div className="border-t border-border p-4 sm:px-5">
              <ListingActions listing={property} showEdit />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
