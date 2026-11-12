import { listMatches } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/roommates/matches: the caller's active matches. */
export const GET = createHandler({ auth: "user", label: "roommates.matches" }, async ({ supabase, user, requestId }) =>
  ok(await listMatches({ supabase, user, requestId })),
);
