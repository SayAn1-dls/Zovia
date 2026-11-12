import { getStats } from "@/features/admin/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/admin/stats — staff overview counts (staff RLS reads). */
export const GET = createHandler({ auth: "staff", label: "admin.stats" }, async ({ supabase, user, requestId }) =>
  ok(await getStats({ supabase, user, requestId })),
);
