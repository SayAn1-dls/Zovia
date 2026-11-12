import { z } from "zod";

import { saveBodySchema } from "@/features/properties/schemas";
import { listSavedProperties, saveProperty } from "@/features/properties/service";
import { created, createHandler, ok, paginationWith } from "@/server/http";

/** GET /api/v1/me/saved-properties: the caller's saved listings, newest first (page/limit). */
export const GET = createHandler(
  {
    auth: "user",
    rateLimit: "search",
    label: "me.saved_properties.list",
    query: z.object(paginationWith({ defaultLimit: 24, maxLimit: 48 })),
  },
  async ({ supabase, user, requestId, query }) => {
    const { items, meta } = await listSavedProperties({ supabase, user, requestId }, query);
    return ok(items, { meta });
  },
);

/** POST /api/v1/me/saved-properties { property_id }: save a published listing (idempotent). */
export const POST = createHandler(
  { auth: "user", rateLimit: "mutation", label: "me.saved_properties.add", body: saveBodySchema },
  async ({ supabase, user, requestId, body }) =>
    created(await saveProperty({ supabase, user, requestId }, body.property_id)),
);
