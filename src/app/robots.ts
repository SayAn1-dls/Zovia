import type { MetadataRoute } from "next";

import { absoluteUrl, disallowedCrawlPaths, site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: [...disallowedCrawlPaths] }],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: site.url,
  };
}
