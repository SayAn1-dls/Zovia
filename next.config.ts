import type { NextConfig } from "next";

import { buildSecurityHeaders } from "./src/server/security-headers";

type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/** next/image may load from Supabase Storage of the configured project, and from Unsplash. */
function supabaseStoragePattern(): RemotePattern[] {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) return [];
  try {
    const url = new URL(value);
    return [
      {
        protocol: url.protocol === "http:" ? "http" : "https",
        hostname: url.hostname,
        port: url.port,
        pathname: "/storage/v1/object/**",
      },
    ];
  } catch {
    return [];
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Stable since Next 15.5: <Link href> and router pushes are type-checked.
  typedRoutes: true,
  // Generator defaults for Next 16.4: keep.
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      ...supabaseStoragePattern(),
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
  // Security headers on every response (pages, API, static files). The policy is static so
  // prerendered pages stay cacheable; see src/server/security-headers.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
          siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
          isDev: process.env.NODE_ENV === "development",
        }),
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
