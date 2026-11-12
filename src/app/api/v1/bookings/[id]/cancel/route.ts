import { z } from "zod";

import { cancelBookingSchema } from "@/features/bookings/schemas";
import { cancelBooking } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

export const POST = createHandler(
  { auth: "user", label: "bookings.cancel", params: z.object({ id: z.uuid() }), body: cancelBookingSchema },
  async ({ supabase, user, requestId, params, body }) => {
    await cancelBooking({ supabase, user, requestId }, params.id, body.reason);
    return ok({ status: "cancelled" as const });
  },
);
