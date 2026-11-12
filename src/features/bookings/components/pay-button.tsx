"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormMessage } from "@/components/form/form-field";
import { Button } from "@/components/ui/button";
import { apiFetch, isApiError } from "@/lib/api/client";

import type { PaymentOrder } from "../schemas";

type RazorpayResponse = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open(): void; on(event: "payment.failed", handler: (response: unknown) => void): void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

function loadCheckout(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Pays an accepted booking with Razorpay Checkout. The order (and its amount) is created by the
 * server; after Checkout the server verifies the signature and the amount with Razorpay before the
 * booking becomes confirmed. Payment success is shown only after that verification.
 */
export function PayButton({ bookingId, prefill }: { bookingId: string; prefill?: { name?: string; email?: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "danger" | "info" | "success"; text: string } | null>(null);

  async function pay() {
    setBusy(true);
    setMessage(null);
    try {
      const order = await apiFetch<PaymentOrder>(`/bookings/${bookingId}/payment-order`, { method: "POST" });
      if (order.status === "demo") {
        if (!window.confirm("Demo payment: no real money moves. Confirm this booking?")) {
          setBusy(false);
          return;
        }
        await apiFetch("/payments/demo", { method: "POST", body: { booking_id: bookingId } });
        setMessage({ tone: "success", text: "Demo payment done. Your booking is confirmed (no money moved)." });
        setBusy(false);
        router.refresh();
        return;
      }
      if (order.status === "not_configured") {
        setMessage({ tone: "info", text: "Online payment is not set up on ZUVIO yet. The owner can still see your accepted booking." });
        setBusy(false);
        return;
      }
      if (!(await loadCheckout()) || !window.Razorpay) {
        setMessage({ tone: "danger", text: "The payment window could not load. Check your connection and try again." });
        setBusy(false);
        return;
      }
      const checkout = new window.Razorpay({
        key: order.key_id,
        order_id: order.order_id,
        amount: order.amount_paise,
        currency: order.currency,
        name: "ZUVIO",
        description: order.description,
        prefill,
        theme: { color: "#6D4AFF" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (response: RazorpayResponse) => {
          try {
            await apiFetch("/payments/razorpay/verify", { method: "POST", body: response });
            setMessage({ tone: "success", text: "Payment received. Your booking is confirmed." });
            router.refresh();
          } catch (error) {
            setMessage({
              tone: "danger",
              text: isApiError(error) ? error.message : "We could not confirm the payment yet. Refresh in a minute.",
            });
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on("payment.failed", () => setMessage({ tone: "danger", text: "The payment did not go through. You were not charged." }));
      checkout.open();
    } catch (error) {
      setMessage({ tone: "danger", text: isApiError(error) ? error.message : "Something went wrong. Please try again." });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
      <Button type="button" size="xl" onClick={pay} disabled={busy} className="w-full sm:w-auto">
        {busy ? <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden /> : <CreditCard data-icon="inline-start" aria-hidden />}
        Pay and confirm
      </Button>
    </div>
  );
}
