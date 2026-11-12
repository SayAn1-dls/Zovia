import { z } from "zod";

import { signInSchema } from "@/features/auth/schemas";
import { signIn } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";

/** POST /api/v1/auth/sign-in: sets the session cookies and says where to go next. */
export const POST = createHandler(
  {
    auth: "optional",
    rateLimit: "auth",
    label: "auth.sign_in",
    body: signInSchema.extend({ next: z.string().max(2048).optional() }),
    maxBodyBytes: 5_000,
  },
  async ({ body, supabase, user, requestId }) => ok(await signIn({ supabase, user, requestId }, body)),
);
