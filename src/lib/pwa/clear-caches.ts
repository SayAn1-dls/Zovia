/**
 * Called on sign-out: asks the service worker to forget every cached page and asset, and clears the
 * page-side Cache Storage too. Safe when there is no worker, no Cache API or the browser refuses.
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      const worker = navigator.serviceWorker.controller ?? registration?.active ?? null;
      worker?.postMessage({ type: "zovia:clear-caches" });
    }
  } catch {
    // No worker, or messaging failed: the cache clear below still runs.
  }
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("zovia-")).map((key) => caches.delete(key)));
    }
  } catch {
    // Cache Storage unavailable (private mode): nothing to clear.
  }
}
