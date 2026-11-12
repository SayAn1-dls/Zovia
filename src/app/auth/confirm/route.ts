import { NextResponse } from "next/server";

import { completeAuthRedirect } from "@/features/auth/service";
import { routes } from "@/lib/navigation";
import { newRequestId } from "@/server/auth/context";
import { getSession } from "@/server/auth/session";
import { toAppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

/**
 * GET /auth/confirm: landing point for e-mail links (sign-up verification, password reset,
 * e-mail change) and, via /auth/callback, OAuth redirects. Verifies the token or exchanges the
 * code, which writes the session cookies, then redirects. `next` is validated as a same-origin
 * relative path inside the service. Failures go to sign-in with a friendly message.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestId = newRequestId();
  const params = {
    code: url.searchParams.get("code"),
    token_hash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
    next: url.searchParams.get("next"),
  };

  try {
    const { supabase } = await getSession();
    const to = await completeAuthRedirect({ supabase, user: null, requestId }, params);
    return NextResponse.redirect(new URL(to, url.origin));
  } catch (thrown) {
    const error = toAppError(thrown);
    logger.warn("auth.confirm_failed", { request_id: requestId, code: error.code });
    const target = params.type === "recovery" ? routes.forgotPassword : routes.signIn;
    return NextResponse.redirect(new URL(`${target}?error=link_invalid`, url.origin));
  }
}
