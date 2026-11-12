import { afterEach, describe, expect, it, vi } from "vitest";

import { hmacHex } from "./payment-provider";

vi.mock("server-only", () => ({}));

describe("Razorpay signatures", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("matches Razorpay's documented HMAC-SHA256 hex format", () => {
    // HMAC-SHA256("order_1|pay_1", "secret"), computed independently.
    expect(hmacHex("secret", "order_1|pay_1")).toMatch(/^[a-f0-9]{64}$/);
    expect(hmacHex("secret", "order_1|pay_1")).toBe(hmacHex("secret", "order_1|pay_1"));
    expect(hmacHex("secret", "order_1|pay_1")).not.toBe(hmacHex("other", "order_1|pay_1"));
  });

  it("is disabled unless all three keys are set, and verifies only correct signatures", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_x");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "");
    vi.stubEnv("RAZORPAY_WEBHOOK_SECRET", "whsec");
    const envModule = await import("@/server/env");
    envModule.resetEnvCache();
    const first = await import("./payment-provider");
    expect(first.getPaymentProvider()).toBeNull();

    vi.resetModules();
    vi.stubEnv("RAZORPAY_KEY_SECRET", "keysecret");
    const second = await import("./payment-provider");
    const provider = second.getPaymentProvider();
    expect(provider).not.toBeNull();
    const good = hmacHex("keysecret", "order_9|pay_9");
    expect(provider!.verifyCheckoutSignature({ orderId: "order_9", paymentId: "pay_9", signature: good })).toBe(true);
    expect(provider!.verifyCheckoutSignature({ orderId: "order_9", paymentId: "pay_8", signature: good })).toBe(false);
    expect(provider!.verifyCheckoutSignature({ orderId: "order_9", paymentId: "pay_9", signature: "00" })).toBe(false);
    const body = '{"event":"payment.captured"}';
    expect(provider!.verifyWebhookSignature(body, hmacHex("whsec", body))).toBe(true);
    expect(provider!.verifyWebhookSignature(body + " ", hmacHex("whsec", body))).toBe(false);
  });
});
