import { z } from "zod";

import { getBooking } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

/** GET one booking (seeker, owner or staff; RLS decides). */
export const GET = createHandler(
  { auth: "user", label: "bookings.get", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => ok(await getBooking({ supabase, user, requestId }, params.id)),
);
