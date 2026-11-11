import type { MetadataRoute } from "next";

/**
 * Site-wide constants. Isomorphic: only NEXT_PUBLIC_* variables are read, so
 * this module is safe in client and server code.
 */

const DEFAULT_SITE_URL = "http://localhost:3000";

function normaliseSiteUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return DEFAULT_SITE_URL;
  try {
    return new URL(value).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function optional(raw: string | undefined): string | null {
  const value = raw?.trim();
  return value ? value : null;
}

/** Digits only, as wa.me expects (country code included, no "+"). */
function normaliseWhatsAppNumber(raw: string | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export const site = {
  name: "ZUVIO",
  tagline: "Find your space. Find your people.",
  description:
    "ZUVIO helps students and working professionals in India find PGs, hostels, co-living spaces and flats, and roommates who match how they live.",
  /** Origin without a trailing slash, from NEXT_PUBLIC_SITE_URL. */
  url: normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "en_IN",
  themeColor: "#0b1026",
  /** null when NEXT_PUBLIC_SUPPORT_EMAIL is unset: hide the e-mail, never invent one. */
  supportEmail: optional(process.env.NEXT_PUBLIC_SUPPORT_EMAIL),
  /** null when NEXT_PUBLIC_WHATSAPP_NUMBER is unset: the support button is hidden. */
  whatsappNumber: normaliseWhatsAppNumber(
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
  ),
} as const;

/** Absolute URL for a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${site.url}/`).toString();
}

/**
 * Cities ZUVIO launches with. This mirrors the `cities` reference table
 * (slug = lower-case name); it is used only for static shortcuts on marketing
 * pages. Anything data-driven must read the table through the API.
 */
export const launchCities = [
  { slug: "bengaluru", name: "Bengaluru", state: "Karnataka" },
  { slug: "mumbai", name: "Mumbai", state: "Maharashtra" },
  { slug: "delhi", name: "Delhi", state: "Delhi" },
  { slug: "gurugram", name: "Gurugram", state: "Haryana" },
  { slug: "noida", name: "Noida", state: "Uttar Pradesh" },
  { slug: "pune", name: "Pune", state: "Maharashtra" },
  { slug: "hyderabad", name: "Hyderabad", state: "Telangana" },
  { slug: "chennai", name: "Chennai", state: "Tamil Nadu" },
  { slug: "kolkata", name: "Kolkata", state: "West Bengal" },
  { slug: "ahmedabad", name: "Ahmedabad", state: "Gujarat" },
  { slug: "jaipur", name: "Jaipur", state: "Rajasthan" },
  { slug: "chandigarh", name: "Chandigarh", state: "Chandigarh" },
  { slug: "indore", name: "Indore", state: "Madhya Pradesh" },
  { slug: "kota", name: "Kota", state: "Rajasthan" },
  { slug: "sonipat", name: "Sonipat", state: "Haryana" },
] as const;

export type LaunchCity = (typeof launchCities)[number];

/** Static, public, indexable paths (kept in sync with src/lib/navigation.ts). */
export const publicStaticPaths = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/roommates", priority: 0.8, changeFrequency: "weekly" },
  { path: "/list-your-property", priority: 0.8, changeFrequency: "monthly" },
  { path: "/about", priority: 0.5, changeFrequency: "monthly" },
  { path: "/safety", priority: 0.5, changeFrequency: "monthly" },
  { path: "/contact", priority: 0.4, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
] as const satisfies ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
}>;

/**
 * Builds the sitemap. `dynamicEntries` is the seam for later work: the
 * properties module passes published listing URLs (absolute, or site-relative
 * paths) and they are appended after the static routes.
 */
export function buildSitemap(
  dynamicEntries: MetadataRoute.Sitemap = [],
): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = publicStaticPaths.map(
    (entry) => ({
      url: absoluteUrl(entry.path),
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
    }),
  );
  const extra = dynamicEntries.map((entry) => ({
    ...entry,
    url: entry.url.startsWith("/") ? absoluteUrl(entry.url) : entry.url,
  }));
  return [...staticEntries, ...extra];
}

/** Paths crawlers must not index (private areas, API, auth flows). */
export const disallowedCrawlPaths = [
  "/api/",
  "/admin",
  "/owner",
  "/messages",
  "/settings",
  "/onboarding",
  "/notifications",
  "/saved",
  "/assistant",
  "/account",
  "/auth/",
  "/sign-in",
  "/sign-up",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
] as const;
