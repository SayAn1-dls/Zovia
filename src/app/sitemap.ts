import type { MetadataRoute } from "next";

import { buildSitemap } from "@/lib/site";

/**
 * Static public routes for now. When listings exist, fetch the published
 * property URLs here (cookieless public client, cached) and pass them to
 * `buildSitemap(dynamicEntries)`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return buildSitemap();
}
