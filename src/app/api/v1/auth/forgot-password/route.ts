import { emailOnlySchema } from "@/features/auth/schemas";
import { requestPasswordReset } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/auth/forgot-password: e-mails a reset link (same answer for any address). */
export const POST = createHandler(
  { auth: "optional", rateLimit: "auth", label: "auth.forgot_password", body: emailOnlySchema, maxBodyBytes: 5_000 },
  async ({ body, supabase, user, requestId }) => {
    await requestPasswordReset({ supabase, user, requestId }, body);
    return ok({ status: "sent" as const });
  },
);
