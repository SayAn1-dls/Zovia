import { requestBookingSchema } from "@/features/bookings/schemas";
import { listMyBookings, requestBooking } from "@/features/bookings/service";
import { createHandler, created, ok } from "@/server/http";

/** GET: the caller's bookings as a seeker. POST: request a booking (amount set by the database). */
export const GET = createHandler({ auth: "user", label: "bookings.list" }, async ({ supabase, user, requestId }) =>
  ok(await listMyBookings({ supabase, user, requestId })),
);

export const POST = createHandler(
  { auth: "user", label: "bookings.request", body: requestBookingSchema, maxBodyBytes: 5_000 },
  async ({ supabase, user, requestId, body }) => created(await requestBooking({ supabase, user, requestId }, body)),
);
