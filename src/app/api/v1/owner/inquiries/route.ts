import { listInquiries } from "@/features/owner/service";
import { createHandler, ok } from "@/server/http";

/** GET /api/v1/owner/inquiries — enquiries about the caller's listings (RLS: owner of the property). */
export const GET = createHandler({ auth: "owner", label: "owner.inquiries" }, async ({ supabase, user, requestId }) =>
  ok(await listInquiries({ supabase, user, requestId })),
);
