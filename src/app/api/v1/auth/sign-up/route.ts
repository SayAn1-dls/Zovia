import { signUpSchema } from "@/features/auth/schemas";
import { signUp } from "@/features/auth/service";
import { createHandler, created } from "@/server/http";

/**
 * POST /api/v1/auth/sign-up: e-mail + password. Returns `signed_in` (with where to go) when
 * Supabase Auth does not require e-mail confirmation, otherwise `verification_sent`. With
 * confirmation on, the answer is the same whether or not the address already has an account.
 */
export const POST = createHandler(
  { auth: "optional", rateLimit: "auth", label: "auth.sign_up", body: signUpSchema, maxBodyBytes: 5_000 },
  async ({ body, supabase, user, requestId }) => {
    return created(await signUp({ supabase, user, requestId }, body));
  },
);
