"use client";

/**
 * SESSION SEAM (foundation <-> auth module)
 * -----------------------------------------
 * Shared chrome (SiteHeader, MobileTabBar, ...) needs to know "is someone
 * signed in, and who?" WITHOUT reading cookies on the server, because public
 * pages must stay static. So the answer is resolved on the client through
 * `useSession()`.
 *
 * This file defines the contract and ships the default implementation, which
 * honestly reports "signed out" (there is no auth module wired in yet).
 *
 * To plug in real auth, the auth module implements a `SessionAdapter` (for
 * example on top of the Supabase browser client's `onAuthStateChange`) and
 * the `sessionAdapter` constant in src/components/providers.tsx is pointed at
 * it (one import, one line).
 *
 * Nothing else changes: no component restyling, no prop drilling.
 *
 * Security note: this state only drives what the chrome LOOKS like. It is
 * never an authorisation check; the proxy, the server guards and RLS are.
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";

export type SessionRole = "seeker" | "owner" | "moderator" | "admin";

export type SessionUser = {
  id: string;
  display_name: string | null;
  /** Absolute or site-relative image URL, already resolved from avatar_path. */
  avatar_url: string | null;
  roles: readonly SessionRole[];
};

export type SessionSnapshot =
  /** Not known yet (first paint before the browser session is read). */
  | { status: "loading"; user: null }
  | { status: "signed_out"; user: null }
  | { status: "signed_in"; user: SessionUser };

export type SessionAdapter = {
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe: (onChange: () => void) => () => void;
  /** Current state in the browser. Must return a stable reference until it changes. */
  getSnapshot: () => SessionSnapshot;
  /**
   * State used for server rendering and hydration. Must not depend on the
   * request: return LOADING (or SIGNED_OUT) so public pages stay static.
   */
  getServerSnapshot: () => SessionSnapshot;
  /** Ends the session. Optional: the "Sign out" item is hidden without it. */
  signOut?: () => Promise<void>;
};

export const SESSION_LOADING: SessionSnapshot = { status: "loading", user: null };
export const SESSION_SIGNED_OUT: SessionSnapshot = {
  status: "signed_out",
  user: null,
};

/** Default adapter: nobody is signed in. Replaced by the auth module. */
export const signedOutAdapter: SessionAdapter = {
  subscribe: () => () => {},
  getSnapshot: () => SESSION_SIGNED_OUT,
  getServerSnapshot: () => SESSION_SIGNED_OUT,
};

export type Session = SessionSnapshot & {
  isSignedIn: boolean;
  isLoading: boolean;
  hasRole: (role: SessionRole) => boolean;
  /** Undefined when the adapter cannot sign out (the default adapter). */
  signOut: (() => Promise<void>) | undefined;
};

const SessionContext = createContext<SessionAdapter>(signedOutAdapter);

export default function SessionProvider({
  adapter = signedOutAdapter,
  children,
}: {
  adapter?: SessionAdapter;
  children: ReactNode;
}) {
  return <SessionContext value={adapter}>{children}</SessionContext>;
}

export { SessionProvider };

/** Client-side session state for shared chrome. See the note at the top of this file. */
export function useSession(): Session {
  const adapter = useContext(SessionContext);
  const snapshot = useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getServerSnapshot,
  );
  return useMemo(
    () => ({
      ...snapshot,
      isSignedIn: snapshot.status === "signed_in",
      isLoading: snapshot.status === "loading",
      hasRole: (role: SessionRole) =>
        snapshot.status === "signed_in" && snapshot.user.roles.includes(role),
      signOut: adapter.signOut,
    }),
    [snapshot, adapter.signOut],
  );
}
