"use client";

import { Download } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers the service worker once (production only), so Zovia can be installed and works offline. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

/** "Install the app" button; shown only when the browser offers installation (Chrome, Edge, Android). */
export function InstallAppButton({ className }: { className?: string }) {
  const available = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const [busy, setBusy] = useState(false);
  if (!available) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!deferred) return;
        setBusy(true);
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        deferred = null;
        setBusy(false);
        notify();
      }}
      className={cn(
        "inline-flex h-11 items-center gap-2 rounded-full bg-lime px-4 text-[0.9375rem] font-semibold text-ink transition-opacity hover:opacity-90",
        className,
      )}
    >
      <Download className="size-4" aria-hidden />
      Install the Zovia app
    </button>
  );
}
