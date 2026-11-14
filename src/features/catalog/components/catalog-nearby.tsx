import { Bus, Coffee, GraduationCap, Hospital, ShoppingBasket, TrainFront, UtensilsCrossed, type LucideIcon } from "lucide-react";

import { NEARBY_GROUPS, type CatalogNearbyKind, type CatalogNearbyPlace } from "../nearby";

const GROUP_ICONS: Record<string, LucideIcon> = {
  Restaurants: UtensilsCrossed,
  Cafés: Coffee,
  "Grocery & supermarkets": ShoppingBasket,
  "Metro & railway stations": TrainFront,
  Hospitals: Hospital,
  "Colleges & universities": GraduationCap,
};

const KIND_LABELS: Partial<Record<CatalogNearbyKind, string>> = { metro_station: "Metro", railway_station: "Railway", university: "University" };

/** "Restaurants 200 m · Café 350 m ...": rough walking time at ~80 m a minute. */
function distanceLabel(metres: number): string {
  if (metres < 1000) {
    const minutes = Math.max(1, Math.round(metres / 80));
    return `${Math.round(metres / 10) * 10} m · ${minutes} min walk`;
  }
  return `${(metres / 1000).toFixed(1)} km`;
}

/** What's around a PG, grouped (food, cafés, groceries, transport, health, study). */
export function CatalogNearby({ places }: { places: CatalogNearbyPlace[] }) {
  const groups = NEARBY_GROUPS.map((group) => ({
    ...group,
    places: places.filter((place) => group.kinds.includes(place.kind)).slice(0, 4),
  })).filter((group) => group.places.length > 0);

  if (groups.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Bus className="size-4" aria-hidden />
        Shops, eateries and public transport are within a short walk. Use the map above to explore.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((group) => {
          const Icon = GROUP_ICONS[group.title] ?? Bus;
          return (
            <div key={group.title} className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <h4 className="flex items-center gap-2 text-sm font-semibold">
                <span className="flex size-7 items-center justify-center rounded-full bg-lime/60 text-ink">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                {group.title}
              </h4>
              <ul className="mt-2 divide-y divide-border text-sm">
                {group.places.map((place) => (
                  <li key={`${place.kind}-${place.name}`} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">
                      {place.name}
                      {KIND_LABELS[place.kind] ? <span className="ml-1.5 text-xs text-muted-foreground">{KIND_LABELS[place.kind]}</span> : null}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{distanceLabel(place.metres)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Straight-line distance from the PG. Data ©{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline">
          OpenStreetMap contributors
        </a>
        .
      </p>
    </div>
  );
}
