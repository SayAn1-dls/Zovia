import { availabilityQuerySchema } from "@/features/stays/schemas";
import { availability } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

/** GET ?listing=<slug>&checkin=YYYY-MM-DD&checkout=YYYY-MM-DD: per room type, units left and price. */
export const GET = createHandler(
  { auth: "public", rateLimit: "search", label: "stays.availability", query: availabilityQuerySchema },
  async ({ supabase, query }) => ok(await availability(createStayDeps(supabase), query.listing, query.checkin, query.checkout), {
      // Public and cookieless: the same dates are served from the CDN for 15 s (stale for 30 more).
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    }),
);
