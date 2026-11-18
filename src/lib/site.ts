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

/**
 * Digits only, as wa.me expects: country code included, no "+", no leading zeros. wa.me rejects a
 * number without its country code ("phone number is invalid"), and an Indian mobile is very often
 * typed without 91, so a bare 10-digit number starting 6-9, or one written with a leading 0 or 00,
 * is completed with India's code. Anything else is kept as typed.
 */
export function normaliseWhatsAppNumber(raw: string | undefined): string | null {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[6-9]\d{9}$/.test(digits)) digits = digits.slice(1);
  if (/^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`;
  return digits.length >= 8 ? digits : null;
}

/** The address people may write to directly. Public on purpose: the owner wants visitors to reach them. */
const DEFAULT_SUPPORT_EMAIL = "sayan.bh.work@gmail.com";

export const site = {
  name: "Zovia",
  tagline: "Find your space. Find your people.",
  description:
    "Zovia helps students and working professionals in India find PGs, hostels, co-living spaces and flats, and roommates who match how they live.",
  /** Origin without a trailing slash, from NEXT_PUBLIC_SITE_URL. */
  url: normaliseSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "en_IN",
  themeColor: "#f6f4ee",
  /** Shown in the footer and on the contact page. NEXT_PUBLIC_SUPPORT_EMAIL overrides the owner's address. */
  supportEmail: optional(process.env.NEXT_PUBLIC_SUPPORT_EMAIL) ?? DEFAULT_SUPPORT_EMAIL,
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
 * Cities Zovia launches with. This mirrors the `cities` reference table
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
  { path: "/get-the-app", priority: 0.4, changeFrequency: "yearly" },
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
