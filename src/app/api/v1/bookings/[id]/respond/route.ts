import { z } from "zod";

import { respondBookingSchema } from "@/features/bookings/schemas";
import { respondToBooking } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

/** Owner accepts or declines a request (the SQL function checks it is their listing). */
export const POST = createHandler(
  { auth: "owner", label: "bookings.respond", params: z.object({ id: z.uuid() }), body: respondBookingSchema },
  async ({ supabase, user, requestId, params, body }) => {
    await respondToBooking({ supabase, user, requestId }, params.id, body);
    return ok({ status: body.accept ? ("accepted" as const) : ("declined" as const) });
  },
);
