import type { StayPayment } from "../schemas";
import type { RazorpayProof } from "./use-stays";

type CheckoutInstance = { open(): void; on(event: "payment.failed", handler: (response: unknown) => void): void };
type CheckoutConstructor = new (options: Record<string, unknown>) => CheckoutInstance;

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function checkoutConstructor(): CheckoutConstructor | undefined {
  return (window as unknown as { Razorpay?: CheckoutConstructor }).Razorpay;
}

function loadCheckout(): Promise<CheckoutConstructor | undefined> {
  const existing = checkoutConstructor();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(checkoutConstructor());
    script.onerror = () => resolve(undefined);
    document.body.appendChild(script);
  });
}

export type CheckoutOutcome =
  | { kind: "paid"; proof: RazorpayProof }
  | { kind: "dismissed" }
  | { kind: "failed" }
  | { kind: "unavailable" };

/**
 * Opens Razorpay Checkout for an order the server created. Resolves once the guest pays, closes the
 * window or the script cannot load. The proof still has to be verified by the server.
 */
export async function openRazorpayCheckout(
  payment: Extract<StayPayment, { mode: "online" }>,
  prefill: { name?: string; email?: string; contact?: string },
): Promise<CheckoutOutcome> {
  const Checkout = await loadCheckout();
  if (!Checkout) return { kind: "unavailable" };
  return new Promise((resolve) => {
    let settled = false;
    // Checkout lets the guest retry after a failed attempt, so a failure only counts once they close it.
    let failedOnce = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome.kind === "dismissed" && failedOnce ? { kind: "failed" } : outcome);
    };
    const checkout = new Checkout({
      key: payment.key_id,
      order_id: payment.order_id,
      amount: payment.amount_paise,
      currency: payment.currency,
      name: "Zovia",
      description: payment.description,
      prefill,
      theme: { color: "#111111" },
      modal: { ondismiss: () => settle({ kind: "dismissed" }) },
      handler: (response: RazorpayProof) => settle({ kind: "paid", proof: response }),
    });
    checkout.on("payment.failed", () => {
      failedOnce = true;
    });
    checkout.open();
  });
}
