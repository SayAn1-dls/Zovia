import { describe, expect, it, vi } from "vitest";

import type { PaymentProvider } from "./payment-provider";
import { capturedPayment, refundSafely } from "./payment-settlement";

vi.mock("server-only", () => ({}));

function fakeProvider(statuses: string[], overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  const queue = [...statuses];
  return {
    name: "razorpay",
    keyId: "rzp_test",
    createOrder: vi.fn(),
    verifyCheckoutSignature: vi.fn(),
    verifyWebhookSignature: vi.fn(),
    fetchPayment: vi.fn(async () => ({ orderId: "order_1", amountPaise: 63000, status: queue.shift() ?? "captured" })),
    capturePayment: vi.fn(async () => undefined),
    refundPayment: vi.fn(async () => ({ refundId: "rfnd_1", status: "processed" as const })),
    ...overrides,
  };
}

describe("capturedPayment", () => {
  it("accepts a captured payment as is", async () => {
    const provider = fakeProvider(["captured"]);
    await expect(capturedPayment(provider, "pay_1", "order_1")).resolves.toEqual({ amountPaise: 63000 });
    expect(provider.capturePayment).not.toHaveBeenCalled();
  });

  it("captures an authorized payment before accepting it", async () => {
    const provider = fakeProvider(["authorized", "captured"]);
    await expect(capturedPayment(provider, "pay_1", "order_1")).resolves.toEqual({ amountPaise: 63000 });
    expect(provider.capturePayment).toHaveBeenCalledWith("pay_1", 63000);
  });

  it("survives a capture race (someone else captured it first)", async () => {
    const provider = fakeProvider(["authorized", "captured"], {
      capturePayment: vi.fn(async () => {
        throw new Error("already captured");
      }),
    });
    await expect(capturedPayment(provider, "pay_1", "order_1")).resolves.toEqual({ amountPaise: 63000 });
  });

  it("refuses payments that are not captured, or belong to another order", async () => {
    await expect(capturedPayment(fakeProvider(["failed"]), "pay_1", "order_1")).rejects.toMatchObject({ code: "bad_request" });
    await expect(capturedPayment(fakeProvider(["authorized", "authorized"]), "pay_1", "order_1")).rejects.toMatchObject({
      code: "bad_request",
    });
    await expect(capturedPayment(fakeProvider(["captured"]), "pay_1", "order_2")).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("refundSafely", () => {
  it("maps processed to refunded and pending to pending", async () => {
    await expect(refundSafely(fakeProvider([]), "pay_1", 63000, {})).resolves.toEqual({ status: "refunded", refundId: "rfnd_1" });
    const pending = fakeProvider([], { refundPayment: vi.fn(async () => ({ refundId: "rfnd_2", status: "pending" as const })) });
    await expect(refundSafely(pending, "pay_1", 63000, {})).resolves.toEqual({ status: "pending", refundId: "rfnd_2" });
  });

  it("never throws: a failed refund returns null (stays refund_due)", async () => {
    const failing = fakeProvider([], {
      refundPayment: vi.fn(async () => {
        throw new Error("gateway down");
      }),
    });
    await expect(refundSafely(failing, "pay_1", 63000, {})).resolves.toBeNull();
    await expect(refundSafely(null, "pay_1", 63000, {})).resolves.toBeNull();
    await expect(refundSafely(fakeProvider([]), "pay_1", 0, {})).resolves.toBeNull();
  });
});
