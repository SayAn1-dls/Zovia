import { getMe } from "@/features/account/service";
import { createHandler, ok } from "@/server/http";

/**
 * GET /api/v1/me: the signed-in account as the browser may see it (display name, avatar,
 * roles, status, onboarding). Drives the header; never an authorisation input. Suspended
 * accounts get an answer too, so the chrome can show them the right place.
 */
export const GET = createHandler(
  { auth: "user", allowSuspended: true, label: "me.get" },
  async ({ supabase, user, requestId }) =>
    ok(await getMe({ supabase, user, requestId })),
);
