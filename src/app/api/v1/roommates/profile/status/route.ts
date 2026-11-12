import { profileStatusSchema } from "@/features/roommates/schemas";
import { setProfileStatus } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** PATCH /api/v1/roommates/profile/status: go live ("active") or pause ("paused"). */
export const PATCH = createHandler(
  { auth: "user", label: "roommates.profile.status", body: profileStatusSchema },
  async ({ supabase, user, requestId, body }) => ok(await setProfileStatus({ supabase, user, requestId }, body.status)),
);
