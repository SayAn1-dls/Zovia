import {
  Armchair,
  BadgeCheck,
  BedDouble,
  Beer,
  Bath,
  CalendarClock,
  Camera,
  Car,
  ChefHat,
  ChevronRight,
  Cigarette,
  CigaretteOff,
  Clock,
  Coffee,
  Dog,
  Droplets,
  Dumbbell,
  Fingerprint,
  Flame,
  Info,
  Leaf,
  MapPin,
  Navigation,
  Phone,
  Refrigerator,
  Shirt,
  ShoppingBasket,
  Snowflake,
  Sofa,
  Sparkles,
  ArrowUpDown,
  TrainFront,
  Tv,
  UserCheck,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Zap,
  Check,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Money } from "@/components/money";
import { buttonVariants } from "@/components/ui/button";
import { WhatsAppIcon, WhatsAppShareButton } from "@/components/whatsapp/whatsapp-buttons";
import { MapView } from "@/features/locations/components/map-view";
import { PhotoGallery } from "@/features/properties/components/photo-gallery";
import { TENANT_GENDER_LABELS } from "@/features/properties/schemas";
import { dynamicRoutes, routes } from "@/lib/navigation";
import { absoluteUrl, site } from "@/lib/site";
import { cn } from "@/lib/utils";

import {
  AMENITY_LABELS,
  DIET_LABELS,
  GUEST_LABELS,
  KIND_LABELS,
  SHARING_LABELS,
  SMOKING_LABELS,
  directionsUrl,
  type AmenityCode,
  type CatalogListing,
} from "../listings";
import type { CatalogNearbyPlace } from "../nearby";
import { CatalogCard } from "./catalog-card";
import { CatalogNearby } from "./catalog-nearby";
import { VisitRequestForm } from "./visit-request-form";

const AMENITY_ICONS: Record<AmenityCode, LucideIcon> = {
  wifi: Wifi,
  ac: Snowflake,
  attached_bathroom: Bath,
  laundry: Shirt,
  housekeeping: Sparkles,
  power_backup: Zap,
  hot_water: Flame,
  cctv: Camera,
  biometric_entry: Fingerprint,
  fridge: Refrigerator,
  tv: Tv,
  study_table: Armchair,
  wardrobe: Shirt,
  gym: Dumbbell,
  parking: Car,
  lift: ArrowUpDown,
  ro_water: Droplets,
  common_lounge: Sofa,
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="scroll-mt-24 border-t border-border py-8">
      <h2 id={`${id}-heading`} className="mb-5 text-xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Rule({ ok, icon: Icon, children }: { ok: boolean; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-card p-3.5 ring-1 ring-border">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          ok ? "bg-success-surface text-success-foreground" : "bg-danger-surface text-danger-foreground",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="text-sm font-medium">{children}</span>
      <span className="sr-only">{ok ? "(allowed)" : "(not allowed)"}</span>
      {ok ? <Check className="ml-auto size-4 text-success-foreground" aria-hidden /> : <X className="ml-auto size-4 text-danger-foreground" aria-hidden />}
    </li>
  );
}

/** Everything about one PG: photos, about, room-wise rent, food, rules, amenities, map and what's nearby. */
export function CatalogListingView({
  listing,
  similar,
  nearby,
}: {
  listing: CatalogListing;
  similar: CatalogListing[];
  nearby: CatalogNearbyPlace[];
}) {
  const place = `${listing.locality}, ${listing.city}`;
  const deposit = Math.min(...listing.sharing.map((option) => option.deposit));
  const whatsapp = site.whatsappNumber;
  const nav = [
    ["about", "About"],
    ["rooms", "Rooms & rent"],
    ["food", "Food"],
    ["rules", "House rules"],
    ["amenities", "Amenities"],
    ["location", "Location & nearby"],
  ] as const;

  return (
    <article className="pb-24 lg:pb-0">
      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link href={routes.cities} className="hover:text-foreground hover:underline">
          Cities
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <Link href={dynamicRoutes.city(listing.city_slug)} className="hover:text-foreground hover:underline">
          {listing.city}
        </Link>
        <ChevronRight className="size-3.5" aria-hidden />
        <span className="text-foreground">{listing.locality}</span>
      </nav>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {[KIND_LABELS[listing.kind], TENANT_GENDER_LABELS[listing.gender], listing.food.provided ? DIET_LABELS[listing.food.diet!] : "Self-cooking", listing.furnishing === "fully_furnished" ? "Fully furnished" : "Semi-furnished"].map((tag) => (
              <span key={tag} className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">
                {tag}
              </span>
            ))}
          </div>
          <h1 className="text-display-md font-extrabold break-words">{listing.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {place}
          </p>
        </div>
        <div className="flex gap-2">
          <a href={directionsUrl(listing)} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <Navigation aria-hidden />
            Directions
          </a>
          <WhatsAppShareButton text={`${listing.title}, ${place} on Zovia`} url={absoluteUrl(`/properties/${listing.slug}`)} label="Share" />
        </div>
      </header>

      <PhotoGallery
        title={listing.title}
        photos={listing.photos.map((photo, index) => ({ id: `${listing.slug}-${index}`, url: photo.url, alt: photo.alt, width: null, height: null, room_id: null }))}
      />

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Wallet, label: "Rent from", value: <Money amount={listing.price_from} suffix="/mo" /> },
          { icon: BadgeCheck, label: "Deposit from", value: <Money amount={deposit} /> },
          { icon: BedDouble, label: "Beds free", value: listing.available_beds > 0 ? `${listing.available_beds} of ${listing.total_beds}` : "Full right now" },
          { icon: UtensilsCrossed, label: "Food", value: listing.food.provided ? `${listing.food.meals.length} meals/day` : "Kitchen access" },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl bg-card p-4 ring-1 ring-border">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" aria-hidden />
              {label}
            </dt>
            <dd className="mt-1 text-lg font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      {(() => {
        const nearest = (kinds: string[]) => nearby.find((place) => kinds.includes(place.kind));
        const items = [
          { icon: TrainFront, label: "Station", place: nearest(["metro_station", "railway_station"]) },
          { icon: ShoppingBasket, label: "Grocery", place: nearest(["grocery"]) },
          { icon: Coffee, label: "Café", place: nearest(["cafe"]) },
          { icon: UtensilsCrossed, label: "Restaurant", place: nearest(["restaurant"]) },
        ].filter((item) => item.place);
        if (items.length === 0) return null;
        return (
          <ul aria-label="Nearest essentials" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {items.map(({ icon: Icon, label, place }) => (
              <li key={label} className="flex items-center gap-2.5 rounded-2xl bg-lime/35 px-3.5 py-2.5 text-sm">
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{place!.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {label} ·{" "}
                    {place!.metres < 1000 ? `${Math.max(1, Math.round(place!.metres / 80))} min walk` : `${(place!.metres / 1000).toFixed(1)} km`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        );
      })()}

      <nav aria-label="On this page" className="sticky top-16 z-10 -mx-5 mt-6 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8">
        {nav.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-2 grid gap-10 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0">
          <Section id="about" title="About this place">
            <p className="leading-relaxed text-foreground/90">{listing.about}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {listing.highlights.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-medium">
                  <Check className="size-4 text-success-foreground" aria-hidden />
                  {item}
                </li>
              ))}
              <li className="flex items-center gap-2 text-sm font-medium">
                <UserCheck className="size-4 text-success-foreground" aria-hidden />
                Best for: {listing.best_for}
              </li>
            </ul>
          </Section>

          <Section id="rooms" title="Rooms & rent">
            <div className="overflow-hidden rounded-2xl ring-1 ring-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Room</th>
                    <th className="px-4 py-3 font-semibold">Rent</th>
                    <th className="hidden px-4 py-3 font-semibold sm:table-cell">Deposit</th>
                    <th className="px-4 py-3 font-semibold">Beds free</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {listing.sharing.map((option) => (
                    <tr key={option.type}>
                      <td className="px-4 py-3">
                        <p className="font-semibold">{SHARING_LABELS[option.type]}</p>
                        <p className="text-xs text-muted-foreground">
                          {[option.ac ? "AC" : "Non-AC", option.attached_bathroom ? "Attached bath" : "Shared bath"].join(" · ")}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        <Money amount={option.rent} suffix="/mo" />
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <Money amount={option.deposit} />
                      </td>
                      <td className={cn("px-4 py-3 font-medium", option.beds_left > 0 ? "text-success-foreground" : "text-muted-foreground")}>
                        {option.beds_left > 0 ? option.beds_left : "Full"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden />
              Rent includes Wi-Fi, water and maintenance{listing.food.provided ? " and meals" : ""}. Electricity is shared by meter. {listing.rules.notice_days}-day notice to leave.
            </p>
          </Section>

          <Section id="food" title="Food">
            <div className="flex items-start gap-4 rounded-2xl bg-card p-5 ring-1 ring-border">
              <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full", listing.food.diet === "veg" ? "bg-success-surface text-success-foreground" : "bg-warning-surface text-warning-foreground")}>
                {listing.food.diet === "veg" ? <Leaf className="size-5" aria-hidden /> : <ChefHat className="size-5" aria-hidden />}
              </span>
              <div>
                <p className="font-semibold">
                  {listing.food.provided ? `${DIET_LABELS[listing.food.diet!]} meals included` : "Meals not included"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {listing.food.provided
                    ? `${listing.food.meals.join(", ")} served every day. ${listing.food.diet === "veg" ? "The kitchen is vegetarian only." : "Non-veg is served on set days of the week."}`
                    : "Cook your own meals in the shared kitchen, or order in: plenty of tiffin services and restaurants deliver here."}
                </p>
                <p className="mt-2 text-sm">
                  <span className="font-medium">Kitchen access for residents:</span> {listing.food.kitchen_access ? "Yes" : "No"}
                  {listing.food.kitchen_access ? ` · Cooking non-veg: ${listing.rules.non_veg_cooking ? "allowed" : "not allowed"}` : ""}
                </p>
              </div>
            </div>
          </Section>

          <Section id="rules" title="House rules">
            <ul className="grid gap-2.5 sm:grid-cols-2">
              <Rule ok={listing.rules.smoking !== "not_allowed"} icon={listing.rules.smoking === "not_allowed" ? CigaretteOff : Cigarette}>
                {SMOKING_LABELS[listing.rules.smoking]}
              </Rule>
              <Rule ok={listing.rules.alcohol} icon={Beer}>
                {listing.rules.alcohol ? "Alcohol allowed" : "No alcohol"}
              </Rule>
              <Rule ok={listing.food.diet !== "veg"} icon={listing.food.diet === "veg" ? Leaf : UtensilsCrossed}>
                {listing.food.diet === "veg" ? "Vegetarian premises" : "Non-veg food allowed"}
              </Rule>
              <Rule ok={listing.rules.guests !== "not_allowed"} icon={Users}>
                {GUEST_LABELS[listing.rules.guests]}
              </Rule>
              <Rule ok={listing.rules.gate_closes === null} icon={Clock}>
                {listing.rules.gate_closes ? `Gate closes at ${listing.rules.gate_closes}` : "No curfew, 24×7 entry"}
              </Rule>
              <Rule ok={listing.rules.pets} icon={Dog}>
                {listing.rules.pets ? "Pets allowed" : "No pets"}
              </Rule>
            </ul>
          </Section>

          <Section id="amenities" title="Amenities">
            <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {listing.amenities.map((code) => {
                const Icon = AMENITY_ICONS[code];
                return (
                  <li key={code} className="flex items-center gap-2.5 text-sm">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    {AMENITY_LABELS[code]}
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="location" title="Location & what's nearby">
            <p className="mb-4 flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              {listing.address}
            </p>
            <MapView
              center={{ lat: listing.lat, lng: listing.lng }}
              zoom={15}
              markers={[
                ...nearby
                  .filter((place) => place.metres < 2500)
                  .map((place) => ({ id: `${place.kind}-${place.name}`, lat: place.lat, lng: place.lng, title: place.name, tone: "muted" as const })),
                { id: listing.slug, lat: listing.lat, lng: listing.lng, title: listing.title, label: "PG" },
              ]}
              label={`Map showing ${listing.title}`}
              className="h-72 sm:h-96"
            />
            <a href={directionsUrl(listing)} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: "outline" }), "mt-3")}>
              <Navigation aria-hidden />
              Open in Google Maps
            </a>
            <h3 className="mt-8 mb-4 text-lg font-semibold">Nearby restaurants, cafés, stations and shops</h3>
            <CatalogNearby places={nearby} />
          </Section>

          {similar.length > 0 ? (
            <section aria-labelledby="similar-heading" className="border-t border-border py-8">
              <div className="mb-5 flex items-end justify-between gap-3">
                <h2 id="similar-heading" className="text-xl font-bold tracking-tight">
                  More PGs near {listing.locality}
                </h2>
                <Link href={dynamicRoutes.city(listing.city_slug)} className="text-sm font-semibold underline-offset-4 hover:underline">
                  All of {listing.city}
                </Link>
              </div>
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {similar.map((other) => (
                  <li key={other.slug}>
                    <CatalogCard listing={other} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <aside id="visit" className="scroll-mt-24 lg:sticky lg:top-32 lg:self-start" aria-label="Book a visit">
          <div className="space-y-5 rounded-3xl bg-card p-5 ring-1 ring-border sm:p-6">
            <div>
              <p className="text-2xl font-bold">
                <span className="mr-1 text-base font-normal text-muted-foreground">from</span>
                <Money amount={listing.price_from} suffix="/month" />
              </p>
              <p className={cn("mt-1 text-sm font-medium", listing.available_beds > 0 ? "text-success-foreground" : "text-muted-foreground")}>
                {listing.available_beds > 0 ? `${listing.available_beds} beds available` : "Full right now: join the waitlist"}
              </p>
            </div>
            {whatsapp ? (
              <div className="grid grid-cols-2 gap-2">
                <a href={`tel:+${whatsapp}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                  <Phone aria-hidden />
                  Call
                </a>
                <a
                  href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hi, I'm interested in ${listing.title}, ${place} (Zovia).`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  <WhatsAppIcon />
                  WhatsApp
                </a>
              </div>
            ) : null}
            <div>
              <h2 className="mb-3 text-base font-semibold">Request a visit</h2>
              <VisitRequestForm listingTitle={listing.title} place={place} sharing={listing.sharing.map((option) => option.type)} />
            </div>
            <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Sample listing: rent, vacancy and rules are representative for {listing.locality}. Zovia confirms the exact details with the owner before your visit.
            </p>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-5 py-3 backdrop-blur lg:hidden">
        <p className="text-lg font-bold">
          <Money amount={listing.price_from} suffix="/mo" />
        </p>
        <a href="#visit" className={buttonVariants({ size: "lg" })}>
          Request a visit
        </a>
      </div>
    </article>
  );
}
