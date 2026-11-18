import { z } from "zod";

import { cancelStaySchema } from "@/features/stays/schemas";
import { cancel } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

/** POST { reason? }: cancels by policy. Returns { booking, refund_percent }. */
export const POST = createHandler(
  { auth: "user", label: "stays.cancel", params: z.object({ id: z.uuid() }), body: cancelStaySchema, maxBodyBytes: 2_000 },
  async ({ supabase, params, body }) => ok(await cancel(createStayDeps(supabase), params.id, body.reason)),
);
