import { verifyPaymentSchema } from "@/features/bookings/schemas";
import { verifyCheckoutPayment } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

/** Browser callback from Razorpay Checkout: signature + amount verified server-side. */
export const POST = createHandler(
  { auth: "user", label: "payments.verify", body: verifyPaymentSchema, maxBodyBytes: 2_000 },
  async ({ supabase, user, requestId, body }) => ok(await verifyCheckoutPayment({ supabase, user, requestId }, body)),
);
