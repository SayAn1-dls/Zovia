import { getPaymentProvider } from "@/features/bookings/payment-provider";
import { handleWebhookEvent } from "@/features/bookings/service";
import { newRequestId } from "@/server/auth/context";
import { toAppError } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

/**
 * POST /api/v1/payments/razorpay/webhook. Called by Razorpay's servers, so it is not wrapped in
 * createHandler (no session, no same-origin check). Trust comes only from the HMAC signature over
 * the raw body with RAZORPAY_WEBHOOK_SECRET. Unknown orders are acknowledged (200) so Razorpay
 * stops retrying; transient failures return 500 so it retries.
 */
export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const provider = getPaymentProvider();
  if (!provider) return new Response("payments not configured", { status: 503 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const raw = await request.text();
  if (raw.length > 200_000 || !provider.verifyWebhookSignature(raw, signature)) {
    logger.warn("payments.webhook_bad_signature", { request_id: requestId });
    return new Response("invalid signature", { status: 400 });
  }

  try {
    await handleWebhookEvent(JSON.parse(raw));
    return new Response("ok", { status: 200 });
  } catch (thrown) {
    const error = toAppError(thrown);
    if (error.status < 500) {
      logger.warn("payments.webhook_ignored", { request_id: requestId, code: error.code });
      return new Response("ignored", { status: 200 });
    }
    logger.error("payments.webhook_failed", { request_id: requestId, error: serializeError(thrown) });
    return new Response("retry", { status: 500 });
  }
}
