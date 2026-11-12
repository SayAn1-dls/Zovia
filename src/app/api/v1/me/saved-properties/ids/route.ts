import { listSavedPropertyIds } from "@/features/properties/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/me/saved-properties/ids: ids of the caller's saved listings (up to 1,000), so
 * cards on public pages can show the saved state without the server reading cookies.
 */
export const GET = createHandler(
  { auth: "user", rateLimit: "search", label: "me.saved_properties.ids" },
  async ({ supabase, user, requestId }) => ok(await listSavedPropertyIds({ supabase, user, requestId })),
);
