import type { Metadata, Viewport } from "next";
import { Onest, Unbounded } from "next/font/google";

import { Providers } from "@/components/providers";
import { site } from "@/lib/site";

import "./globals.css";

// Self-hosted by next/font at build time: no requests to Google at runtime.
// Text: Onest. latin-ext carries the rupee sign (U+20B9).
const onest = Onest({
  variable: "--font-onest",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

// Display: Unbounded, for headlines and the wordmark only (never long text).
const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale,
    url: "/",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: site.themeColor,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Root layout. It deliberately reads no cookies or headers, so public pages
 * stay static; per-user chrome resolves on the client (see session-context).
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-IN"
      className={`${onest.variable} ${unbounded.variable} h-full antialiased`}
      // Browser extensions add attributes to <html> before hydration. This
      // silences attribute mismatches on this element only, not its children.
      suppressHydrationWarning
      // globals.css sets smooth scrolling; this tells Next to switch it off during route changes.
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main-content"
          className="sr-only z-50 rounded-full bg-lime px-5 py-3 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
