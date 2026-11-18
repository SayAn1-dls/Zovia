import { timingSafeEqual } from "node:crypto";

import { expireStaleBookings } from "@/features/bookings/payment-repository";
import { expireStayHolds } from "@/features/stays/payment";
import { createHandler, errors, ok } from "@/server/http";
import { env } from "@/server/env";

/**
 * GET /api/v1/cron/expire: scheduled housekeeping (vercel.json "crons"; pg_cron does the same where
 * it is installed). Closes stay holds whose 15 minutes ran out and finished stays, and expires
 * long-stay requests the owner never answered or acceptances never paid. Availability is already
 * right without it (expired holds stop counting at once); this keeps the statuses honest.
 *
 * Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". Without CRON_SECRET the route is off.
 */
function authorised(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const GET = createHandler(
  { auth: "public", rateLimit: { max: 30, windowSeconds: 3600 }, label: "cron.expire" },
  async ({ request, log }) => {
    const secret = env().CRON_SECRET;
    if (!secret) throw errors.notFound();
    if (!authorised(request.headers.get("authorization"), secret)) throw errors.unauthenticated("Missing or wrong cron secret.");

    const [stays, bookings] = await Promise.all([expireStayHolds(), expireStaleBookings()]);
    log.info("cron.expire", { stays, bookings });
    return ok({ stays_changed: stays, bookings_expired: bookings });
  },
);
