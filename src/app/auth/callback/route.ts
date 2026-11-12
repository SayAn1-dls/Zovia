import { NextResponse } from "next/server";

import { completeAuthRedirect } from "@/features/auth/service";
import { routes } from "@/lib/navigation";
import { newRequestId } from "@/server/auth/context";
import { getSession } from "@/server/auth/session";
import { toAppError } from "@/server/http/errors";
import { logger } from "@/server/logger";

/** GET /auth/callback: OAuth (PKCE) return address. Exchanges `?code=` for a session. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const requestId = newRequestId();
  try {
    const { supabase } = await getSession();
    const to = await completeAuthRedirect(
      { supabase, user: null, requestId },
      { code: url.searchParams.get("code"), next: url.searchParams.get("next") },
    );
    return NextResponse.redirect(new URL(to, url.origin));
  } catch (thrown) {
    logger.warn("auth.callback_failed", { request_id: requestId, code: toAppError(thrown).code });
    return NextResponse.redirect(new URL(`${routes.signIn}?error=oauth_failed`, url.origin));
  }
}
