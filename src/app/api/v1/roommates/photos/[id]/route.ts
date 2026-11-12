import { z } from "zod";

import { removePhoto } from "@/features/roommates/service";
import { createHandler, ok } from "@/server/http";

/** DELETE /api/v1/roommates/photos/:id: removes one of the caller's photos. */
export const DELETE = createHandler(
  { auth: "user", label: "roommates.photos.remove", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => {
    await removePhoto({ supabase, user, requestId }, params.id);
    return ok({ removed: true });
  },
);
