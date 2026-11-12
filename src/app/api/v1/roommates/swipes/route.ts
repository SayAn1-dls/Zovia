import { swipeSchema } from "@/features/roommates/schemas";
import { swipe } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/roommates/swipes: like or pass. A mutual like returns the new match and chat. */
export const POST = createHandler(
  { auth: "user", label: "roommates.swipe", rateLimit: { max: 120, windowSeconds: 60 }, body: swipeSchema },
  async ({ supabase, user, requestId, body }) => ok(await swipe({ supabase, user, requestId }, body)),
);
