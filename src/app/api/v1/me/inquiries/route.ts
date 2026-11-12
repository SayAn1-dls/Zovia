import { z } from "zod";

import { listMyInquiries } from "@/features/properties/service";
import { createHandler, ok, paginationWith } from "@/server/http";

/** GET /api/v1/me/inquiries: enquiries the caller has sent, newest first (page/limit). */
export const GET = createHandler(
  {
    auth: "user",
    rateLimit: "search",
    label: "me.inquiries.list",
    query: z.object(paginationWith({ defaultLimit: 20, maxLimit: 50 })),
  },
  async ({ supabase, user, requestId, query }) => {
    const { items, meta } = await listMyInquiries({ supabase, user, requestId }, query);
    return ok(items, { meta });
  },
);
