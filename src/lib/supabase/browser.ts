import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { publicEnv } from "./public-env";

/**
 * Browser Supabase client (singleton). Allowed uses ONLY (spec section 4):
 *   1. auth session state in the header (onAuthStateChange, signOut, OAuth / OTP starts),
 *   2. Realtime subscriptions,
 *   3. Storage uploads and downloads.
 * All data reads and writes go through server code (`/api/v1` via `apiFetch`, or Server
 * Actions). Do not call `.from()` or `.rpc()` on this client.
 *
 * The session lives in cookies (shared with the server clients), so it must only be created in
 * the browser; calling this during server rendering throws.
 */
let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (typeof window === "undefined") {
    throw new Error("getSupabaseBrowserClient() was called on the server. Use it in effects or event handlers.");
  }
  client ??= createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
  return client;
}
