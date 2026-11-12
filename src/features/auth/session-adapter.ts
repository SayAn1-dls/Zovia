"use client";

import {
  SESSION_LOADING,
  SESSION_SIGNED_OUT,
  type SessionAdapter,
  type SessionSnapshot,
} from "@/components/session/session-context";
import type { Me } from "@/features/account/schemas";
import { apiFetch, isApiError } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * The real SessionAdapter (see src/components/session/session-context.tsx).
 *
 * The browser Supabase client is used only to learn WHEN the session changes (sign-in in another
 * tab, token refresh, sign-out). WHO is signed in, with which roles, comes from GET /api/v1/me,
 * which the server answers from a verified token and the database. This state only shapes the
 * chrome; every page, route and RLS policy checks again on the server.
 */

let snapshot: SessionSnapshot = SESSION_LOADING;
const listeners = new Set<() => void>();
let started = false;
let loadSeq = 0;

function publish(next: SessionSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

async function loadMe(): Promise<void> {
  const seq = ++loadSeq;
  try {
    const me = await apiFetch<Me>("/me");
    if (seq !== loadSeq) return;
    publish({
      status: "signed_in",
      user: { id: me.id, display_name: me.display_name, avatar_url: me.avatar_url, roles: me.roles },
    });
  } catch (error) {
    if (seq !== loadSeq) return;
    // 401: the cookie is gone or invalid. Anything else: we cannot vouch for a user, so the
    // chrome shows the signed-out state; protected pages still decide for themselves.
    if (!isApiError(error) || error.status !== 401) console.warn("Could not load the signed-in account.", error);
    publish(SESSION_SIGNED_OUT);
  }
}

function start() {
  if (started) return;
  started = true;
  const supabase = getSupabaseBrowserClient();
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") return;
    if (session) void loadMe();
    else {
      loadSeq += 1;
      publish(SESSION_SIGNED_OUT);
    }
  });
}

/** Re-reads /api/v1/me (after onboarding, a profile edit or becoming an owner). */
export function refreshSession(): Promise<void> {
  return loadMe();
}

export const supabaseSessionAdapter: SessionAdapter = {
  subscribe(onChange) {
    listeners.add(onChange);
    start();
    return () => listeners.delete(onChange);
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => SESSION_LOADING,
  async signOut() {
    await apiFetch("/auth/sign-out", { method: "POST" });
    // Clears the browser client's copy too; the server already revoked the session.
    await getSupabaseBrowserClient().auth.signOut({ scope: "local" });
    loadSeq += 1;
    publish(SESSION_SIGNED_OUT);
  },
};
