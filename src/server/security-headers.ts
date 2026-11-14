/**
 * Security headers for every response. Pure and dependency-free: imported by next.config.ts
 * (which cannot use the "@/..." alias or "server-only") and unit-tested.
 *
 * Why the CSP has no nonce: a nonce must be generated per request, which forces every page to
 * render dynamically. Public pages here are prerendered and cached (Cache Components), so the
 * policy is static and set in next.config.ts, the approach the Next.js CSP guide documents for
 * that case ("Without Nonces"). The cost is `'unsafe-inline'` for scripts (Next.js emits inline
 * bootstrap scripts); script and connection *origins* are still locked down, and framing, base
 * and form targets are fully restricted.
 */

export type SecurityHeaderOptions = {
  /** NEXT_PUBLIC_SUPABASE_URL. Its origin is allowed for API calls, Realtime and Storage images. */
  supabaseUrl?: string;
  /** NEXT_PUBLIC_SITE_URL. `upgrade-insecure-requests` is added only when it is https. */
  siteUrl?: string;
  /** `next dev` needs 'unsafe-eval' (React debugging) and a websocket for HMR. */
  isDev?: boolean;
};

const UNSPLASH = "https://images.unsplash.com";
const MAP_TILES = "https://tiles.openfreemap.org";
const GTM = "https://www.googletagmanager.com";
// Razorpay Checkout (bookings): script, its payment iframe and its telemetry/API calls.
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com";
const RAZORPAY = ["https://api.razorpay.com", "https://*.razorpay.com"];
const GA_CONNECT = [
  "https://www.google-analytics.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  GTM,
];
const GA_IMG = ["https://www.google-analytics.com", "https://*.google-analytics.com", GTM];

function httpOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(options: SecurityHeaderOptions = {}): string {
  const supabase = httpOrigin(options.supabaseUrl);
  const supabaseWs = supabase ? supabase.replace(/^http/, "ws") : null;
  const siteIsHttps = httpOrigin(options.siteUrl)?.startsWith("https://") ?? false;
  const list = (...sources: (string | null | false | undefined)[]) =>
    sources.filter((source): source is string => Boolean(source)).join(" ");

  const directives: [string, string][] = [
    ["default-src", "'self'"],
    ["script-src", list("'self'", "'unsafe-inline'", options.isDev && "'unsafe-eval'", GTM, RAZORPAY_SCRIPT)],
    ["style-src", "'self' 'unsafe-inline'"],
    ["img-src", list("'self'", "data:", "blob:", supabase, UNSPLASH, MAP_TILES, ...GA_IMG, ...RAZORPAY)],
    ["font-src", "'self' data:"],
    [
      "connect-src",
      list("'self'", supabase, supabaseWs, MAP_TILES, "https://formsubmit.co", ...GA_CONNECT, ...RAZORPAY, options.isDev && "ws://localhost:* ws://127.0.0.1:*"),
    ],
    ["media-src", list("'self'", "blob:", supabase)],
    // MapLibre GL runs its tile workers from blob: URLs.
    ["worker-src", "'self' blob:"],
    ["child-src", "'self' blob:"],
    ["frame-src", list(...RAZORPAY)],
    ["object-src", "'none'"],
    ["manifest-src", "'self'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["frame-ancestors", "'none'"],
  ];
  const policy = directives.map(([name, value]) => `${name} ${value}`);
  if (siteIsHttps && !options.isDev) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}

export function buildSecurityHeaders(options: SecurityHeaderOptions = {}): { key: string; value: string }[] {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    // Two years, subdomains, preload-eligible. Browsers ignore it over plain http (local).
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // Geolocation for this origin only ("near me" search); everything else off.
    {
      key: "Permissions-Policy",
      value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=(), browsing-topics=()",
    },
    // Legacy equivalent of frame-ancestors 'none'.
    { key: "X-Frame-Options", value: "DENY" },
  ];
}
