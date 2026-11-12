import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { env } from "@/server/env";

import type { AppSupabaseClient } from "./types";

/**
 * SERVICE-ROLE CLIENT. BYPASSES ROW LEVEL SECURITY. READ BEFORE IMPORTING.
 *
 * The only allowed uses (spec section 2, principle 2):
 *   1. Reference-data ingestion: writing `places` / `property_nearby_places` and similar rows
 *      that only the trusted server path may write.
 *   2. E-mail recipient lookup: resolving the address of a user who is not the caller in order
 *      to send them a transactional e-mail.
 *   3. The Postgres rate limiter for traffic that has no user session (`check_rate_limit`).
 *   4. Recording and confirming online payments (`record_payment_order`, `confirm_booking_payment`),
 *      only after the server verified the payment provider's signature (spec 14.2).
 *
 * Never use it to read or write on behalf of a request's user, to "work around" an RLS error,
 * or in any code path whose inputs come straight from the client. Core flows must work with
 * the public key alone. Importing this module is restricted by ESLint to an allowlist
 * (see ADMIN_CLIENT_ALLOWLIST in eslint.config.mjs); extend that list only for the uses above.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY is not configured: callers must degrade visibly
 * (skip, log, report through /api/v1/health) and must not fake success.
 */
let client: AppSupabaseClient | null | undefined;

export function createSupabaseAdminClient(): AppSupabaseClient | null {
  if (client === undefined) {
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
    client = SUPABASE_SERVICE_ROLE_KEY
      ? createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  }
  return client;
}

/** Test hook. */
export function resetSupabaseAdminClient(): void {
  client = undefined;
}
