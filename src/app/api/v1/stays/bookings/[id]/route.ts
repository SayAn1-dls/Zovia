import { z } from "zod";

import { getBooking } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

/** GET one of the caller's own stay bookings. */
export const GET = createHandler(
  { auth: "user", label: "stays.get", params: z.object({ id: z.uuid() }) },
  async ({ supabase, params }) => ok(await getBooking(createStayDeps(supabase), params.id)),
);
