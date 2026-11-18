/*
 * Zovia service worker: makes the site installable as an app and keeps the PUBLIC pages usable on a
 * bad connection. Only an allowlist of public pages is ever cached (never bookings, account,
 * messages, owner, admin, settings, saved or notifications), built assets and images are cache-first
 * and size-capped, and everything is cleared when the user signs out (message "zovia:clear-caches").
 * API calls and other origins are never touched. Bump VERSION to drop every older cache.
 */
const VERSION = "zovia-v2";
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";
const PRECACHE = ["/", "/cities", OFFLINE_URL];
const MAX_PAGES = 40;
const MAX_ASSETS = 300;

function isPublicPage(pathname) {
  return (
    pathname === "/" ||
    pathname === "/cities" ||
    pathname.startsWith("/cities/") ||
    pathname.startsWith("/properties/") ||
    pathname === "/get-the-app" ||
    pathname === OFFLINE_URL
  );
}

function isStaticAsset(pathname) {
  return pathname.startsWith("/_next/static/") || pathname.startsWith("/images/") || pathname.startsWith("/icons/");
}

/** Evicts the oldest entries (Cache keys are in insertion order) until at most `max` remain. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

async function put(cacheName, request, response, max) {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
  await trim(cacheName, max);
}

async function offlineResponse() {
  return (
    (await caches.match(OFFLINE_URL)) ||
    new Response("You are offline. Reconnect and try again.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== PAGES && key !== ASSETS).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// Signing out: forget every cached page and asset, then keep only the offline page.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "zovia:clear-caches") return;
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => caches.open(PAGES))
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => undefined),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    if (isPublicPage(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok && !response.redirected) {
              const copy = response.clone();
              event.waitUntil(put(PAGES, request, copy, MAX_PAGES).catch(() => undefined));
            }
            return response;
          })
          .catch(async () => (await caches.match(request)) || offlineResponse()),
      );
    } else {
      // Private or unknown pages: always the network, never stored, never served from a cache.
      event.respondWith(fetch(request).catch(() => offlineResponse()));
    }
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              event.waitUntil(put(ASSETS, request, copy, MAX_ASSETS).catch(() => undefined));
            }
            return response;
          }),
      ),
    );
  }
});
