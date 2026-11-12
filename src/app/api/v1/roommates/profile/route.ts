import { roommateProfileSchema } from "@/features/roommates/schemas";
import { getOwnProfile, saveOwnProfile } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/roommates/profile: the caller's own roommate profile (form values + photos). */
export const GET = createHandler({ auth: "user", label: "roommates.profile.get" }, async ({ supabase, user, requestId }) =>
  ok(await getOwnProfile({ supabase, user, requestId })),
);

/** PUT /api/v1/roommates/profile: create or replace the caller's roommate profile. */
export const PUT = createHandler(
  { auth: "user", label: "roommates.profile.save", body: roommateProfileSchema },
  async ({ supabase, user, requestId, body }) => ok(await saveOwnProfile({ supabase, user, requestId }, body)),
);
