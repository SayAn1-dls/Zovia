import { roomPhotos, type RoomPhotoKey } from "@/lib/photos";

import type { PropertyType, SearchResultItem, TenantGender } from "@/features/properties/schemas";

import { CATALOG_CITIES, getCatalogCity, type CatalogCity } from "./cities";

/**
 * Zovia's PG catalogue for every tier 1 and tier 2 city: PGs, hostels and co-living spaces with
 * photos, room-wise rent, food, house rules and amenities, pinned in real neighbourhoods so the
 * map and the live "nearby" lookup (OpenStreetMap) are accurate.
 *
 * Listings are generated deterministically from the city and neighbourhood, so a PG keeps the
 * same name, rent and rules on every visit and its URL never changes. They are marked as sample
 * listings in the UI: Zovia confirms price, vacancy and rules with the owner on every enquiry.
 */

export type CatalogKind = "pg" | "hostel" | "co_living";
export type Diet = "veg" | "veg_nonveg";
export type SmokingRule = "allowed" | "outside_only" | "not_allowed";
export type GuestRule = "allowed" | "day_only" | "not_allowed";
export type SharingType = "single" | "double" | "triple";

export const AMENITY_CODES = [
  "wifi",
  "ac",
  "attached_bathroom",
  "laundry",
  "housekeeping",
  "power_backup",
  "hot_water",
  "cctv",
  "biometric_entry",
  "fridge",
  "tv",
  "study_table",
  "wardrobe",
  "gym",
  "parking",
  "lift",
  "ro_water",
  "common_lounge",
] as const;
export type AmenityCode = (typeof AMENITY_CODES)[number];

export const AMENITY_LABELS: Record<AmenityCode, string> = {
  wifi: "High-speed Wi-Fi",
  ac: "Air conditioning",
  attached_bathroom: "Attached bathroom",
  laundry: "Laundry service",
  housekeeping: "Daily housekeeping",
  power_backup: "Power backup",
  hot_water: "24×7 hot water",
  cctv: "CCTV security",
  biometric_entry: "Biometric entry",
  fridge: "Refrigerator",
  tv: "TV in common area",
  study_table: "Study table & chair",
  wardrobe: "Personal wardrobe",
  gym: "Gym",
  parking: "Two-wheeler parking",
  lift: "Lift",
  ro_water: "RO drinking water",
  common_lounge: "Common lounge",
};

export const KIND_LABELS: Record<CatalogKind, string> = { pg: "PG", hostel: "Hostel", co_living: "Co-living" };
export const SHARING_LABELS: Record<SharingType, string> = {
  single: "Single room",
  double: "Double sharing",
  triple: "Triple sharing",
};
export const DIET_LABELS: Record<Diet, string> = { veg: "Pure veg", veg_nonveg: "Veg & non-veg" };
export const SMOKING_LABELS: Record<SmokingRule, string> = {
  allowed: "Smoking allowed",
  outside_only: "Smoking only in the open area",
  not_allowed: "No smoking",
};
export const GUEST_LABELS: Record<GuestRule, string> = {
  allowed: "Guests allowed",
  day_only: "Guests in the daytime only",
  not_allowed: "No guests in rooms",
};

export type SharingOption = {
  type: SharingType;
  rent: number;
  deposit: number;
  beds_left: number;
  ac: boolean;
  attached_bathroom: boolean;
};

export type CatalogPhoto = { url: string; alt: string };

export type CatalogListing = {
  id: string;
  slug: string;
  title: string;
  kind: CatalogKind;
  property_type: PropertyType;
  gender: TenantGender;
  city_slug: string;
  city: string;
  state: string;
  locality: string;
  address: string;
  lat: number;
  lng: number;
  photos: CatalogPhoto[];
  about: string;
  highlights: string[];
  best_for: string;
  sharing: SharingOption[];
  price_from: number;
  total_beds: number;
  available_beds: number;
  food: { provided: boolean; diet: Diet | null; meals: string[]; kitchen_access: boolean };
  rules: {
    smoking: SmokingRule;
    alcohol: boolean;
    non_veg_cooking: boolean;
    guests: GuestRule;
    gate_closes: string | null;
    pets: boolean;
    notice_days: number;
  };
  amenities: AmenityCode[];
  furnishing: "fully_furnished" | "semi_furnished";
};

// ───────────────────────────── deterministic randomness ─────────────────────────────

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32: a small, fast PRNG; the same seed always gives the same sequence. */
function rng(seed: string) {
  let a = hash(seed);
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
    shuffle: <T,>(items: readonly T[]): T[] => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    },
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

// ───────────────────────────── generator ─────────────────────────────

/** Typical single-room rent (₹/month) per city; double and triple sharing are cheaper. */
const SINGLE_RENT: Record<string, number> = {
  mumbai: 17000,
  bengaluru: 13500,
  gurugram: 14500,
  delhi: 12500,
  pune: 11500,
  hyderabad: 10500,
  chennai: 10500,
  noida: 10500,
  kolkata: 8500,
  ahmedabad: 9000,
};
const TIER_2_SINGLE_RENT = 7500;

const NAME_STEMS = [
  "Sunrise",
  "Green Leaf",
  "Comfort Nest",
  "Urban Nest",
  "Shanti",
  "Blue Bell",
  "Silver Oak",
  "Lotus",
  "Aashiyana",
  "Cozy Corner",
  "Maple",
  "Sapphire",
  "Harmony",
  "Krishna",
  "Saffron",
  "Orchid",
  "Galaxy",
  "Nirvana",
  "Pearl",
  "Skyline",
  "Tulsi",
  "Evergreen",
  "Elite",
  "Homely",
];

const ROOM_PHOTOS: RoomPhotoKey[] = [
  "room-twin",
  "room-student",
  "room-iitb",
  "room-modern",
  "room-cleveland",
  "room-jumbo",
  "room-budget",
  "room-dorm-six",
];
const COMMON_PHOTOS: RoomPhotoKey[] = ["kitchen-plant", "kitchen-fitted", "kitchen-apartment", "lounge-plants", "lounge-modern"];

const MEAL_SETS = [
  ["Breakfast", "Dinner"],
  ["Breakfast", "Lunch", "Dinner"],
  ["Breakfast", "Lunch (packed)", "Dinner"],
] as const;

type Variant = { kind: CatalogKind; gender: TenantGender };
const VARIANTS: Variant[] = [
  { kind: "pg", gender: "male" },
  { kind: "pg", gender: "female" },
  { kind: "co_living", gender: "any" },
  { kind: "pg", gender: "male" },
  { kind: "hostel", gender: "female" },
  { kind: "pg", gender: "female" },
  { kind: "hostel", gender: "male" },
  { kind: "co_living", gender: "any" },
];

function propertyType({ kind, gender }: Variant): PropertyType {
  if (kind === "pg") return gender === "male" ? "boys_pg" : gender === "female" ? "girls_pg" : "pg";
  return kind;
}

function titleFor(stem: string, { kind, gender }: Variant): string {
  if (kind === "co_living") return `${stem} Co-living`;
  if (kind === "hostel") return `${stem} ${gender === "female" ? "Girls" : "Boys"} Hostel`;
  return `${stem} ${gender === "female" ? "Girls" : gender === "male" ? "Boys" : ""} PG`.replace("  ", " ");
}

const STREETS = ["Main Road", "Cross Road", "1st Main", "2nd Cross", "Link Road", "Station Road", "Market Road", "Park Street"];

function buildListing(city: CatalogCity, localityIndex: number, slot: number, usedStems: Set<string>): CatalogListing {
  const locality = city.localities[localityIndex]!;
  const r = rng(`${city.slug}|${locality.name}|${slot}`);
  const variant = VARIANTS[(localityIndex * 2 + slot + hash(city.slug)) % VARIANTS.length]!;
  let stem = r.pick(NAME_STEMS);
  while (usedStems.has(stem)) stem = NAME_STEMS[(NAME_STEMS.indexOf(stem) + 1) % NAME_STEMS.length]!;
  usedStems.add(stem);

  const title = titleFor(stem, variant);
  const slug = `${slugify(title)}-${slugify(locality.name)}-${city.slug}`;

  // About 150–700 m from the neighbourhood centre, so pins don't stack.
  const angle = r.next() * Math.PI * 2;
  const metres = 150 + r.next() * 550;
  const lat = Math.round((locality.lat + (Math.cos(angle) * metres) / 111_000) * 1e5) / 1e5;
  const lng =
    Math.round((locality.lng + (Math.sin(angle) * metres) / (111_000 * Math.cos((locality.lat * Math.PI) / 180))) * 1e5) /
    1e5;

  const base = (SINGLE_RENT[city.slug] ?? TIER_2_SINGLE_RENT) * (0.85 + r.next() * 0.4) * (variant.kind === "co_living" ? 1.2 : 1);
  const premium = variant.kind === "co_living" || r.chance(0.45);
  const sharingTypes: SharingType[] =
    variant.kind === "co_living" ? ["single", "double"] : variant.kind === "hostel" ? ["double", "triple"] : ["single", "double", "triple"];
  const sharing: SharingOption[] = sharingTypes.map((type) => {
    const factor = type === "single" ? 1 : type === "double" ? 0.72 : 0.58;
    const rent = roundTo(base * factor, 500);
    return {
      type,
      rent,
      deposit: rent * (variant.kind === "co_living" ? 2 : 1),
      beds_left: r.int(0, type === "single" ? 2 : 4),
      ac: premium || (type === "single" && r.chance(0.5)),
      attached_bathroom: premium || type === "single",
    };
  });
  if (sharing.every((option) => option.beds_left === 0)) sharing[sharing.length - 1]!.beds_left = 1;

  const provided = variant.kind !== "co_living" || r.chance(0.5);
  const diet: Diet | null = provided ? (r.chance(0.4) ? "veg" : "veg_nonveg") : null;
  const food = {
    provided,
    diet,
    meals: provided ? [...r.pick(MEAL_SETS)] : [],
    kitchen_access: variant.kind === "co_living" || r.chance(0.3),
  };

  const strict = variant.kind === "hostel" || variant.gender === "female";
  const rules = {
    smoking: (variant.kind === "co_living" ? r.pick(["allowed", "outside_only"] as const) : strict ? "not_allowed" : r.pick(["outside_only", "not_allowed"] as const)) as SmokingRule,
    alcohol: variant.kind === "co_living" && r.chance(0.6),
    non_veg_cooking: diet !== "veg" && (food.kitchen_access ? r.chance(0.7) : false),
    guests: (variant.kind === "co_living" ? "allowed" : strict ? "not_allowed" : "day_only") as GuestRule,
    gate_closes: variant.kind === "co_living" ? null : strict ? r.pick(["9:30 pm", "10:00 pm"]) : r.pick(["10:30 pm", "11:00 pm", "11:30 pm"]),
    pets: variant.kind === "co_living" && r.chance(0.3),
    notice_days: r.pick([15, 30, 30]),
  };

  const amenities = AMENITY_CODES.filter((code) => {
    switch (code) {
      case "wifi":
      case "power_backup":
      case "hot_water":
      case "cctv":
      case "wardrobe":
      case "ro_water":
        return true;
      case "ac":
        return sharing.some((option) => option.ac);
      case "attached_bathroom":
        return sharing.some((option) => option.attached_bathroom);
      case "laundry":
      case "housekeeping":
        return premium || r.chance(0.6);
      case "study_table":
        return variant.kind !== "co_living" || r.chance(0.5);
      case "gym":
        return variant.kind === "co_living" && r.chance(0.6);
      case "common_lounge":
        return variant.kind === "co_living" || r.chance(0.4);
      case "biometric_entry":
        return strict || r.chance(0.3);
      default:
        return r.chance(0.5);
    }
  });

  const total_beds = r.int(variant.kind === "hostel" ? 40 : 12, variant.kind === "hostel" ? 90 : 36);
  const available_beds = sharing.reduce((sum, option) => sum + option.beds_left, 0);
  const photoKeys = [...r.shuffle(ROOM_PHOTOS).slice(0, 3), ...r.shuffle(COMMON_PHOTOS).slice(0, 2)];
  const kindLabel = KIND_LABELS[variant.kind];
  const best_for = r.pick(
    variant.kind === "hostel" ? ["Students", "Students and interns"] : ["Working professionals", "Students and working professionals", "Students"],
  );
  const furnishing = premium || r.chance(0.6) ? "fully_furnished" : "semi_furnished";
  const genderPhrase = variant.gender === "male" ? "for men" : variant.gender === "female" ? "for women" : "for men and women";
  const foodPhrase = provided
    ? `${food.meals.length === 3 ? "Three" : "Two"} home-style ${diet === "veg" ? "vegetarian " : ""}meals a day are included in the rent (${food.meals.join(", ").toLowerCase()}).`
    : "Meals aren't included; residents share a fully equipped kitchen.";

  return {
    id: `catalog:${slug}`,
    slug,
    title,
    kind: variant.kind,
    property_type: propertyType(variant),
    gender: variant.gender,
    city_slug: city.slug,
    city: city.name,
    state: city.state,
    locality: locality.name,
    address: `${r.int(3, 240)}, ${r.pick(STREETS)}, ${locality.name}, ${city.name}, ${city.state}`,
    lat,
    lng,
    photos: photoKeys.map((key) => ({ url: roomPhotos[key].src, alt: roomPhotos[key].alt })),
    about: [
      `${title} is a ${furnishing === "fully_furnished" ? "fully furnished" : "semi-furnished"} ${kindLabel.toLowerCase()} ${genderPhrase} in ${locality.name}, ${city.name}, popular with ${best_for.toLowerCase()}.`,
      foodPhrase,
      `Rooms come with ${sharing.some((s) => s.ac) ? "AC options, " : ""}${sharing.some((s) => s.attached_bathroom) ? "attached bathrooms, " : ""}a wardrobe and Wi-Fi, and the property is cleaned ${amenities.includes("housekeeping") ? "every day" : "twice a week"}.`,
      `It sits in a residential lane of ${locality.name}, a short walk from grocery stores, cafés and public transport.`,
    ].join(" "),
    highlights: [
      provided ? `${DIET_LABELS[diet!]} meals included` : "Shared kitchen",
      sharing.some((s) => s.ac) ? "AC rooms" : "Airy non-AC rooms",
      amenities.includes("housekeeping") ? "Daily housekeeping" : "Weekly cleaning",
      rules.gate_closes ? `Gate closes ${rules.gate_closes}` : "No curfew",
    ],
    best_for,
    sharing,
    price_from: Math.min(...sharing.map((option) => option.rent)),
    total_beds,
    available_beds,
    food,
    rules,
    amenities,
    furnishing,
  };
}

function buildCity(city: CatalogCity): CatalogListing[] {
  const used = new Set<string>();
  return city.localities.flatMap((_, index) => [0, 1].map((slot) => buildListing(city, index, slot, used)));
}

let cache: { all: CatalogListing[]; bySlug: Map<string, CatalogListing> } | null = null;

function catalogue() {
  if (!cache) {
    const all = CATALOG_CITIES.flatMap(buildCity);
    cache = { all, bySlug: new Map(all.map((listing) => [listing.slug, listing])) };
  }
  return cache;
}

// ───────────────────────────── queries ─────────────────────────────

export function getCatalogListing(slug: string): CatalogListing | null {
  return catalogue().bySlug.get(slug) ?? null;
}

export function catalogListingsForCity(citySlug: string): CatalogListing[] {
  const city = getCatalogCity(citySlug);
  return city ? catalogue().all.filter((listing) => listing.city_slug === city.slug) : [];
}

export function allCatalogListings(): CatalogListing[] {
  return catalogue().all;
}

/** Other places in the same city, nearest neighbourhood first. */
export function similarCatalogListings(listing: CatalogListing, count = 3): CatalogListing[] {
  return catalogListingsForCity(listing.city_slug)
    .filter((other) => other.slug !== listing.slug)
    .sort((a, b) => Math.hypot(a.lat - listing.lat, a.lng - listing.lng) - Math.hypot(b.lat - listing.lat, b.lng - listing.lng))
    .slice(0, count);
}

export type CatalogSearch = {
  city?: string;
  q?: string;
  types?: readonly PropertyType[];
  gender?: "male" | "female";
  budget_min?: number;
  budget_max?: number;
  food?: boolean;
};

const TYPE_TO_KIND: Partial<Record<PropertyType, CatalogKind>> = {
  pg: "pg",
  boys_pg: "pg",
  girls_pg: "pg",
  hostel: "hostel",
  co_living: "co_living",
  shared_room: "pg",
  private_room: "pg",
};

/** The /search filters applied to the catalogue. */
export function searchCatalog(filters: CatalogSearch): CatalogListing[] {
  const city = filters.city ? getCatalogCity(filters.city) : null;
  if (filters.city && !city) return [];
  const q = filters.q?.trim().toLowerCase();
  return catalogue().all.filter((listing) => {
    if (city && listing.city_slug !== city.slug) return false;
    if (filters.types && filters.types.length > 0) {
      const matches = filters.types.some((type) =>
        type === listing.property_type || (type === "pg" ? listing.kind === "pg" : TYPE_TO_KIND[type] === listing.kind && !type.endsWith("_pg")),
      );
      if (!matches) return false;
    }
    if (filters.gender && listing.gender !== "any" && listing.gender !== filters.gender) return false;
    if (filters.budget_min !== undefined && listing.price_from < filters.budget_min) return false;
    if (filters.budget_max !== undefined && listing.price_from > filters.budget_max) return false;
    if (filters.food && !listing.food.provided) return false;
    if (q && ![listing.title, listing.locality, listing.city].some((field) => field.toLowerCase().includes(q))) return false;
    return true;
  });
}

/** A catalogue listing in the shape the shared property card and search map understand. */
export function toSearchResultItem(listing: CatalogListing): SearchResultItem {
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    property_type: listing.property_type,
    listing_mode: "per_bed",
    tenant_gender: listing.gender,
    furnishing: listing.furnishing,
    locality: listing.locality,
    city: listing.city,
    price_from: listing.price_from,
    available_beds: listing.available_beds,
    total_beds: listing.total_beds,
    amenity_codes: listing.amenities,
    food_available: listing.food.provided,
    cover_url: listing.photos[0]?.url ?? null,
    rating_avg: null,
    rating_count: 0,
    recently_confirmed: false,
    lat: listing.lat,
    lng: listing.lng,
    distance_m: null,
    availability_status: null,
    available_from: null,
  };
}

export function isCatalogId(id: string): boolean {
  return id.startsWith("catalog:");
}

/** Google Maps directions to a listing's pin (opens the app on phones). */
export function directionsUrl(listing: Pick<CatalogListing, "lat" | "lng">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`;
}
