import { emailOnlySchema } from "@/features/auth/schemas";
import { resendVerification } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/auth/resend-verification: sends the sign-up link again (same answer for any address). */
export const POST = createHandler(
  { auth: "optional", rateLimit: "auth", label: "auth.resend_verification", body: emailOnlySchema, maxBodyBytes: 5_000 },
  async ({ body, supabase, user, requestId }) => {
    await resendVerification({ supabase, user, requestId }, body);
    return ok({ status: "sent" as const });
  },
);
