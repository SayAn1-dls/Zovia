import {
  AirVent,
  ArrowUpDown,
  Bath,
  BatteryCharging,
  Bike,
  Car,
  Cctv,
  Check,
  CookingPot,
  DoorClosed,
  Droplets,
  Dumbbell,
  Fence,
  Heater,
  LampDesk,
  type LucideIcon,
  Refrigerator,
  ShieldCheck,
  Shirt,
  ShowerHead,
  Sofa,
  SprayCan,
  Tv,
  Utensils,
  WashingMachine,
  Wifi,
  X,
} from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Money } from "@/components/money";
import { RatingStars } from "@/components/rating-stars";
import { StatusBadge } from "@/components/status-badge";
import { VerifiedBadge } from "@/components/verified-badge";
import { formatDate, pluralize } from "@/lib/format";
import { cn } from "@/lib/utils";

import { availableFromLabel, bedAvailabilityLabel } from "../presenters";
import {
  HOUSE_RULE_LABELS,
  humaniseCode,
  ROOM_TYPE_LABELS,
  type PropertyDetail,
  type PropertyRule,
} from "../schemas";

/** Server-rendered sections of the listing page. Pure presentation of `PropertyDetail`. */

export function DetailSection({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={cn("border-t border-border py-8 sm:py-10", className)}>
      <h2 id={`${id}-heading`} className="mb-5 text-xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** The three separate trust signals; only those that are true are shown (spec 6.2). */
export function TrustBadges({ trust }: { trust: PropertyDetail["trust"] }) {
  const any = trust.owner_verified || trust.authorisation_verified || trust.recently_confirmed;
  if (!any) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Verification">
      {trust.owner_verified ? (
        <li>
          <VerifiedBadge kind="owner" />
        </li>
      ) : null}
      {trust.authorisation_verified ? (
        <li>
          <VerifiedBadge kind="authorisation" />
        </li>
      ) : null}
      {trust.recently_confirmed ? (
        <li>
          <VerifiedBadge kind="recently_confirmed" />
        </li>
      ) : null}
    </ul>
  );
}

/** What each signal means, and which ones this listing has (listing page sidebar). */
export function TrustExplainer({ trust }: { trust: PropertyDetail["trust"] }) {
  const rows = [
    { label: "Owner verified", on: trust.owner_verified, off: "Owner identity not verified yet" },
    {
      label: "Authorisation verified",
      on: trust.authorisation_verified,
      off: "Right to let this property not verified yet",
    },
    {
      label: "Recently confirmed",
      on: trust.recently_confirmed,
      off: trust.last_confirmed_at
        ? `Last confirmed ${formatDate(trust.last_confirmed_at)}`
        : "Not confirmed by the owner yet",
    },
  ];
  return (
    <ul className="space-y-2 text-sm">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start gap-2">
          {row.on ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden />
          ) : (
            <X className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className={cn(!row.on && "text-muted-foreground")}>{row.on ? row.label : row.off}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The availability statement. Entire units: the owner's own statement. Per-bed listings: bed
 * counts, always kept separate from the derived property status.
 */
export function AvailabilitySummary({ property }: { property: PropertyDetail }) {
  const a = property.availability;
  const fromLabel = availableFromLabel(a?.available_from, property.as_of);
  return (
    <div className="space-y-3">
      {property.listing_mode === "per_bed" ? (
        <p className="text-lg font-semibold">{bedAvailabilityLabel(property.available_beds, property.total_beds)}</p>
      ) : a ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={a.status} />
          {fromLabel && (a.status === "available" || a.status === "limited" || a.status === "coming_soon") ? (
            <span className="text-sm font-medium">{fromLabel}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">The owner hasn&apos;t stated availability yet.</p>
      )}
      {a && (a.min_stay_months !== null || a.notice_period_days !== null) ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          {a.min_stay_months !== null ? (
            <div className="flex gap-1">
              <dt>Minimum stay:</dt>
              <dd className="font-medium text-foreground">
                {a.min_stay_months === 0 ? "None" : pluralize(a.min_stay_months, "month")}
              </dd>
            </div>
          ) : null}
          {a.notice_period_days !== null ? (
            <div className="flex gap-1">
              <dt>Notice period:</dt>
              <dd className="font-medium text-foreground">{pluralize(a.notice_period_days, "day")}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}

export function RoomsList({ property }: { property: PropertyDetail }) {
  if (property.rooms.length === 0) {
    return <p className="text-sm text-muted-foreground">The owner hasn&apos;t added rooms yet.</p>;
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {property.rooms.map((room) => {
        const available = room.beds.filter((bed) => bed.status === "available").length;
        const features = [
          room.has_attached_bathroom && "Attached bathroom",
          room.has_ac && "AC",
          room.has_balcony && "Balcony",
          room.floor !== null && (room.floor === 0 ? "Ground floor" : `Floor ${room.floor}`),
          room.area_sqft !== null && `${room.area_sqft} sq ft`,
        ].filter(Boolean) as string[];
        return (
          <li key={room.id} className="rounded-2xl p-4 ring-1 ring-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{room.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {ROOM_TYPE_LABELS[room.room_type]} · {pluralize(room.capacity, "bed")}
                </p>
              </div>
              {room.rent_per_bed !== null ? (
                <p className="text-right font-semibold">
                  <Money amount={room.rent_per_bed} suffix="/bed" />
                </p>
              ) : null}
            </div>
            {features.length > 0 ? <p className="mt-2 text-sm">{features.join(" · ")}</p> : null}
            {room.security_deposit !== null ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Deposit <Money amount={room.security_deposit} />
              </p>
            ) : null}
            {room.description ? <p className="mt-2 text-sm text-muted-foreground">{room.description}</p> : null}
            <div className="mt-3">
              <p className="text-sm font-medium">{bedAvailabilityLabel(available, room.beds.length)}</p>
              {room.beds.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Beds in ${room.name}`}>
                  {room.beds.map((bed) => (
                    <li key={bed.id} className="flex items-center gap-1.5 rounded-full bg-muted py-1 pr-1 pl-3 text-xs">
                      <span className="font-semibold">{bed.label}</span>
                      <StatusBadge
                        status={bed.status}
                        label={
                          bed.status === "available" && bed.available_from && bed.available_from > property.as_of
                            ? `From ${formatDate(bed.available_from, { day: "numeric", month: "short" })}`
                            : undefined
                        }
                        tone={bed.status === "available" && bed.available_from && bed.available_from > property.as_of ? "info" : undefined}
                      />
                      {bed.rent_override !== null ? (
                        <span className="pr-2">
                          <Money amount={bed.rent_override} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const AMENITY_ICONS: Record<string, LucideIcon> = {
  wifi: Wifi,
  "battery-charging": BatteryCharging,
  droplets: Droplets,
  "shower-head": ShowerHead,
  "air-vent": AirVent,
  heater: Heater,
  refrigerator: Refrigerator,
  "washing-machine": WashingMachine,
  tv: Tv,
  bath: Bath,
  "lamp-desk": LampDesk,
  "door-closed": DoorClosed,
  fence: Fence,
  utensils: Utensils,
  shirt: Shirt,
  "spray-can": SprayCan,
  cctv: Cctv,
  "shield-check": ShieldCheck,
  "cooking-pot": CookingPot,
  sofa: Sofa,
  dumbbell: Dumbbell,
  "arrow-up-down": ArrowUpDown,
  car: Car,
  bike: Bike,
};

export function AmenitiesList({ property }: { property: PropertyDetail }) {
  if (property.amenities.length === 0) {
    return <p className="text-sm text-muted-foreground">The owner hasn&apos;t listed amenities yet.</p>;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3">
      {property.amenities.map((amenity) => {
        const Icon = AMENITY_ICONS[amenity.icon] ?? Check;
        return (
          <li key={amenity.code} className="flex items-center gap-3 text-sm">
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            {amenity.name}
          </li>
        );
      })}
    </ul>
  );
}

function ruleText(rule: PropertyRule): string {
  const label = HOUSE_RULE_LABELS[rule.rule_code] ?? humaniseCode(rule.rule_code);
  if (rule.value) return `${label}: ${rule.value}`;
  if (rule.allowed === true) return `${label} allowed`;
  if (rule.allowed === false) return `No ${label.toLowerCase()}`;
  return label;
}

export function HouseRules({ property }: { property: PropertyDetail }) {
  if (property.rules.length === 0) {
    return <p className="text-sm text-muted-foreground">The owner hasn&apos;t listed house rules yet.</p>;
  }
  const sorted = [...property.rules].sort((a, b) => a.rule_code.localeCompare(b.rule_code));
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {sorted.map((rule) => (
        <li key={rule.rule_code} className="flex items-start gap-3 text-sm">
          {rule.allowed === false ? (
            <X className="mt-0.5 size-4 shrink-0 text-danger-foreground" aria-hidden />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-success-foreground" aria-hidden />
          )}
          <span>
            {ruleText(rule)}
            {rule.note ? <span className="block text-muted-foreground">{rule.note}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FoodSummary({ property }: { property: PropertyDetail }) {
  if (!property.food_available) return <p className="text-sm text-muted-foreground">Meals are not provided.</p>;
  const meals = [
    property.meals.breakfast && "Breakfast",
    property.meals.lunch && "Lunch",
    property.meals.dinner && "Dinner",
  ].filter(Boolean) as string[];
  return (
    <p className="text-sm">
      {meals.length > 0 ? meals.join(", ") : "Meals available"}
      {property.food_included ? " · included in rent" : property.food_monthly_charge !== null ? (
        <>
          {" · "}
          <Money amount={property.food_monthly_charge} suffix="/month" />
        </>
      ) : (
        " · charge not stated"
      )}
    </p>
  );
}

export function ReviewsList({ property }: { property: PropertyDetail }) {
  if (property.reviews.length === 0) {
    return (
      <EmptyState
        variant="plain"
        className="py-6"
        title="No reviews yet"
        description="People who enquire about this place can review it after their stay."
      />
    );
  }
  return (
    <div className="space-y-6">
      <RatingStars value={property.rating_avg} count={property.rating_count} size="md" />
      <ul className="grid gap-6 sm:grid-cols-2">
        {property.reviews.map((review) => (
          <li key={review.id} className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold">{review.author_name}</p>
              <p className="text-xs text-muted-foreground">{formatDate(review.created_at)}</p>
            </div>
            <RatingStars value={review.rating} showValue={false} />
            {review.title ? <p className="font-medium">{review.title}</p> : null}
            {review.body ? <p className="text-sm whitespace-pre-line text-muted-foreground">{review.body}</p> : null}
            {review.owner_reply ? (
              <div className="rounded-xl bg-muted p-3 text-sm">
                <p className="font-semibold">Owner&apos;s reply</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">{review.owner_reply.body}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
