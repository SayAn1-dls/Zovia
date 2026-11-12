import { z } from "zod";

import { createPaymentOrder } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

/** Creates the Razorpay order for an accepted booking, or says payments are not configured. */
export const POST = createHandler(
  { auth: "user", rateLimit: "mutation", label: "payments.create_order", params: z.object({ id: z.uuid() }) },
  async ({ supabase, user, requestId, params }) => ok(await createPaymentOrder({ supabase, user, requestId }, params.id)),
);
