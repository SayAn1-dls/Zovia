import { demoPaymentSchema } from "@/features/bookings/schemas";
import { confirmDemoPayment } from "@/features/bookings/service";
import { createHandler, ok } from "@/server/http";

/** Local demo payment: confirms an accepted booking without a gateway. Disabled in production. */
export const POST = createHandler(
  { auth: "user", label: "payments.demo", body: demoPaymentSchema, maxBodyBytes: 1_000 },
  async ({ supabase, user, requestId, body }) => ok(await confirmDemoPayment({ supabase, user, requestId }, body.booking_id)),
);
