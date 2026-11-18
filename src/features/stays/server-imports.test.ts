// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

// nuqs builds client references; if a server module (invoice, e-mails, payment webhook) pulls it
// in, `next build` fails collecting /api/v1/payments/razorpay/webhook. QA found that chain:
// invoice.ts -> hooks/stay-text.ts -> hooks/stay-url-state.ts -> nuqs.
vi.mock("nuqs", () => {
  throw new Error("nuqs (client only) was imported by server code");
});
vi.mock("server-only", () => ({}));

describe("server-side stay modules", () => {
  it("do not import the client-only URL state (nuqs)", async () => {
    await expect(import("./hooks/stay-text")).resolves.toBeDefined();
    await expect(import("./hooks/stay-dates")).resolves.toBeDefined();
    await expect(import("./invoice")).resolves.toBeDefined();
  });
});
