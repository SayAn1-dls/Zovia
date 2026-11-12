import { resetPasswordSchema } from "@/features/auth/schemas";
import { setNewPassword } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";

/**
 * POST /api/v1/auth/reset-password: sets a new password for the signed-in session (the one the
 * recovery link created, or a normal session from settings). Suspended accounts may do this too.
 */
export const POST = createHandler(
  {
    auth: "user",
    allowSuspended: true,
    rateLimit: "auth",
    label: "auth.reset_password",
    body: resetPasswordSchema,
    maxBodyBytes: 5_000,
  },
  async ({ body, supabase, user, requestId }) => {
    await setNewPassword({ supabase, user, requestId }, body.password);
    return ok({ status: "updated" as const });
  },
);
