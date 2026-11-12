import { signOut } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/auth/sign-out: ends the session and clears the cookies. Safe to call twice. */
export const POST = createHandler(
  { auth: "optional", rateLimit: false, label: "auth.sign_out" },
  async ({ supabase, user, requestId }) => {
    if (user) await signOut({ supabase, user, requestId });
    return ok({ signed_out: true });
  },
);
