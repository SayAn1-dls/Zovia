import { z } from "zod";

import { payInstruction } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

/**
 * POST (no body): the payment instruction for the caller's own unpaid booking, so a guest who
 * closed Razorpay can pay again. Re-uses the open order. 409 unless the booking is pending_payment.
 */
export const POST = createHandler(
  { auth: "user", rateLimit: "booking", label: "stays.pay", params: z.object({ id: z.uuid() }), maxBodyBytes: 200 },
  async ({ supabase, params }) => ok(await payInstruction(createStayDeps(supabase), params.id)),
);
