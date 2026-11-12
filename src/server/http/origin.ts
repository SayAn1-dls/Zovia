import "server-only";

import { errors } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isMutatingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

function originOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Same-origin check for state-changing requests (CSRF defence for cookie-authenticated routes).
 *
 * A browser always sends `Origin` on cross-origin and on non-GET same-origin fetches, and modern
 * browsers also send `Sec-Fetch-Site`; neither header can be set by page script.
 *  - `Origin` present: it must equal the configured site origin or the origin this request was
 *    addressed to (Host / X-Forwarded-Host, as set by the platform). "null" is refused.
 *  - otherwise `Sec-Fetch-Site` present: only "same-origin" (and "none", a direct user action)
 *    pass.
 *  - neither header: not a browser request (curl, server-to-server). Such a client carries no
 *    ambient cookies of a victim, so there is nothing to forge; it still has to authenticate.
 *
 * @param siteUrl NEXT_PUBLIC_SITE_URL, when known.
 */
export function isSameOrigin(request: Request, siteUrl?: string): boolean {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    const requestOrigin = originOf(origin);
    if (!requestOrigin) return false;
    const allowed = new Set<string>();
    const site = originOf(siteUrl);
    if (site) allowed.add(site);
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
    if (host) {
      // The scheme is not part of the Host header; a host match on either scheme is the same site
      // for this purpose (the browser already tied the request to that host).
      allowed.add(`https://${host}`);
      allowed.add(`http://${host}`);
    } else {
      const self = originOf(request.url);
      if (self) allowed.add(self);
    }
    return allowed.has(requestOrigin);
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite !== null) return fetchSite === "same-origin" || fetchSite === "none";
  return true;
}

/** Throws `forbidden` when a mutating request fails the same-origin check. */
export function assertSameOrigin(request: Request, siteUrl?: string): void {
  if (isMutatingMethod(request.method) && !isSameOrigin(request, siteUrl)) {
    throw errors.forbidden("Cross-site requests are not allowed.");
  }
}
