import "server-only";

import { createMemorySupabaseClient } from "./memory";
import type { AppSupabaseClient } from "./types";

/**
 * Cookieless anonymous client for cacheable public reads (home, search, property detail,
 * reference data) and for public RPCs such as `submit_contact_message`.
 */
export function createSupabasePublicClient(): AppSupabaseClient {
  return createMemorySupabaseClient();
}
