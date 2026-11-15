import { createHash } from "node:crypto";

import { z } from "zod";

import { signInSchema } from "@/features/auth/schemas";
import { signIn } from "@/features/auth/service";
import { createHandler, ok } from "@/server/http";
import { errors } from "@/server/http/errors";
import { getRateLimiter } from "@/server/http/rate-limit";

/** Sign-in attempts allowed per account in 15 minutes, from any number of IP addresses. */
const PER_ACCOUNT = { max: 10, windowSeconds: 900 };

/**
 * POST /api/v1/auth/sign-in: sets the session cookies and says where to go next.
 *
 * Password guessing is capped twice: per IP (the "auth" preset) and per account, so spreading
 * guesses across many IPs does not help. The account key is a hash of the e-mail address.
 */
export const POST = createHandler(
  {
    auth: "optional",
    rateLimit: "auth",
    label: "auth.sign_in",
    body: signInSchema.extend({ next: z.string().max(2048).optional() }),
    maxBodyBytes: 5_000,
  },
  async ({ body, supabase, user, requestId, log }) => {
    const account = createHash("sha256")
      .update(body.email.trim().toLowerCase())
      .digest("hex")
      .slice(0, 32);
    const budget = await getRateLimiter().limit(
      `auth.sign_in.account:${account}`,
      PER_ACCOUNT,
    );
    if (!budget.allowed) {
      log.warn("auth.account_throttled", {});
      throw errors.rateLimited(
        budget.retryAfterSeconds,
        "Too many sign-in attempts for this account. Try again in a few minutes.",
      );
    }
    return ok(await signIn({ supabase, user, requestId }, body));
  },
);
