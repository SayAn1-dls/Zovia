import { createStayBookingSchema } from "@/features/stays/schemas";
import { createBooking, listBookings } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, created, ok } from "@/server/http";

/** GET: the caller's stay bookings, newest first. */
export const GET = createHandler({ auth: "user", label: "stays.list" }, async ({ supabase }) =>
  ok(await listBookings(createStayDeps(supabase))),
);

/** POST: book. Returns { booking, payment }. */
export const POST = createHandler(
  { auth: "user", rateLimit: "booking", label: "stays.create", body: createStayBookingSchema, maxBodyBytes: 10_000 },
  async ({ supabase, body }) => created(await createBooking(createStayDeps(supabase), body)),
);
