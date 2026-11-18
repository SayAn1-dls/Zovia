import { getPaymentProvider } from "@/features/bookings/payment-provider";
import { handleWebhookEvent } from "@/features/bookings/service";
import { newRequestId } from "@/server/auth/context";
import { toAppError } from "@/server/http/errors";
import { logger, serializeError } from "@/server/logger";

/**
 * POST /api/v1/payments/razorpay/webhook. Called by Razorpay's servers, so it is not wrapped in
 * createHandler (no session, no same-origin check). Trust comes only from the HMAC signature over
 * the raw body with RAZORPAY_WEBHOOK_SECRET. Orders of stay bookings and of long-stay bookings are
 * both handled (handleWebhookEvent routes them). Unknown orders are acknowledged (200) so Razorpay
 * stops retrying; transient failures return 500 so it retries.
 */
const MAX_BODY_BYTES = 200_000;

export async function POST(request: Request): Promise<Response> {
  const requestId = newRequestId();
  const provider = getPaymentProvider();
  if (!provider) return new Response("payments not configured", { status: 503 });

  // Size first, before reading the body: Razorpay events are a few kilobytes.
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return new Response("too large", { status: 413 });

  const signature = request.headers.get("x-razorpay-signature") ?? "";
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES || !provider.verifyWebhookSignature(raw, signature)) {
    logger.warn("payments.webhook_bad_signature", { request_id: requestId });
    return new Response("invalid signature", { status: 400 });
  }

  let event: Parameters<typeof handleWebhookEvent>[0];
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    // Signed but unreadable: retrying will not help, so do not ask Razorpay to.
    logger.warn("payments.webhook_bad_json", { request_id: requestId });
    return new Response("bad json", { status: 400 });
  }

  try {
    await handleWebhookEvent(event);
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
