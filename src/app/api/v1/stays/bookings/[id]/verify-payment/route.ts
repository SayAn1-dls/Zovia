import { z } from "zod";

import { verifyPayment } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

const verifyBodySchema = z.object({
  razorpay_order_id: z.string().trim().min(1).max(100),
  razorpay_payment_id: z.string().trim().min(1).max(100),
  razorpay_signature: z.string().trim().min(1).max(200),
});

/** POST the Razorpay Checkout result for the caller's own booking; returns the booking. */
export const POST = createHandler(
  { auth: "user", rateLimit: "booking", label: "stays.verify_payment", params: z.object({ id: z.uuid() }), body: verifyBodySchema, maxBodyBytes: 2_000 },
  async ({ supabase, params, body }) => ok(await verifyPayment(createStayDeps(supabase), params.id, body)),
);
