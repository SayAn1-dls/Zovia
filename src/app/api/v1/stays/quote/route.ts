import { stayRequestSchema } from "@/features/stays/schemas";
import { quote } from "@/features/stays/service";
import { createStayDeps } from "@/features/stays/wiring";
import { createHandler, ok } from "@/server/http";

/** POST { listing, checkin, checkout, rooms }: priced on the server from the database rent. */
export const POST = createHandler(
  { auth: "public", rateLimit: "search", label: "stays.quote", body: stayRequestSchema, maxBodyBytes: 5_000 },
  async ({ supabase, body }) => ok(await quote(createStayDeps(supabase), body)),
);
