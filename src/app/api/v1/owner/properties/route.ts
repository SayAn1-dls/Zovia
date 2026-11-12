import { listProperties } from "@/features/owner/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/owner/properties — the caller's own listings (any status). */
export const GET = createHandler({ auth: "owner", label: "owner.properties" }, async ({ supabase, user, requestId }) =>
  ok(await listProperties({ supabase, user, requestId })),
);
