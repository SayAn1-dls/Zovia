"use client";

import Link from "next/link";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

import { Button } from "@/components/ui/button";
import { routes } from "@/lib/navigation";

/**
 * Cookie consent.
 *
 * Privacy-preserving default: until the visitor explicitly accepts, analytics
 * is OFF (`analyticsAllowed === false`). The choice is stored in localStorage
 * (not a cookie, so the server never sees it and pages stay static).
 *
 * Anything that loads analytics must gate on `useCookieConsent().analyticsAllowed`.
 */

export type ConsentChoice = "accepted" | "declined";
type ConsentState = ConsentChoice | "undecided" | "unknown";

const STORAGE_KEY = "zuvio.cookie-consent.v1";
const CHANGE_EVENT = "zuvio:cookie-consent";

function readChoice(): ConsentState {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "accepted" || value === "declined" ? value : "undecided";
  } catch {
    // Storage blocked: behave as undecided, which keeps analytics off.
    return "undecided";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

type CookieConsent = {
  /** "unknown" during server render / hydration; then the stored choice. */
  state: ConsentState;
  /** True only after an explicit opt-in. */
  analyticsAllowed: boolean;
  accept: () => void;
  decline: () => void;
  /** Forget the choice so the banner is shown again (used by "Cookie settings"). */
  reset: () => void;
};

const CookieConsentContext = createContext<CookieConsent | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore<ConsentState>(
    subscribe,
    readChoice,
    () => "unknown",
  );

  const write = useCallback((choice: ConsentChoice | null) => {
    try {
      if (choice) window.localStorage.setItem(STORAGE_KEY, choice);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore: without storage the banner simply shows again next visit.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo<CookieConsent>(
    () => ({
      state,
      analyticsAllowed: state === "accepted",
      accept: () => write("accepted"),
      decline: () => write("declined"),
      reset: () => write(null),
    }),
    [state, write],
  );

  return <CookieConsentContext value={value}>{children}</CookieConsentContext>;
}

/** Consent state and actions. Must be used under <Providers>. */
export function useCookieConsent(): CookieConsent {
  const value = useContext(CookieConsentContext);
  if (!value) {
    throw new Error("useCookieConsent must be used inside <Providers>");
  }
  return value;
}

/** Banner shown until the visitor makes a choice. Both buttons carry equal weight. */
export function CookieConsentBanner() {
  const { state, accept, decline } = useCookieConsent();
  if (state !== "undecided") return null;

  return (
    <section
      aria-label="Cookie preferences"
      className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-xl rounded-2xl bg-card p-4 shadow-xl ring-1 ring-border sm:inset-x-6 sm:bottom-6 sm:p-5"
    >
      <p className="text-sm leading-relaxed text-foreground">
        We use essential storage to keep ZUVIO working. With your permission we
        also use analytics to understand what to improve. It stays off unless
        you allow it.{" "}
        <Link
          href={routes.privacy}
          className="font-medium text-violet-strong underline underline-offset-4"
        >
          Privacy policy
        </Link>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={decline}>
          Essential only
        </Button>
        <Button variant="outline" size="lg" onClick={accept}>
          Allow analytics
        </Button>
      </div>
    </section>
  );
}

/** Text button that reopens the banner (footer "Cookie settings"). */
export function CookieSettingsButton({ className }: { className?: string }) {
  const { reset } = useCookieConsent();
  return (
    <button type="button" onClick={reset} className={className}>
      Cookie settings
    </button>
  );
}
