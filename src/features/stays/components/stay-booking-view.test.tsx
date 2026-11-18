import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Booking } from "@/features/bookings/schemas";

import type { StayBooking } from "../schemas";
import { buildStayIcs, freeCancelDeadline } from "../hooks/stay-text";
import { mergeBookings } from "./bookings-timeline";
import { StayBookingView, canCancel, refundPreview } from "./stay-booking-view";
import { mockApi, ok, renderWithProviders } from "./stays-test-utils";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));

afterEach(cleanup);

function booking(overrides: Partial<StayBooking> = {}): StayBooking {
  return {
    id: "6b2f2d4e-0000-4000-8000-000000000001",
    status: "confirmed",
    payment_mode: "online",
    paid: true,
    listing: "sunrise-pg",
    listing_title: "Sunrise PG",
    city: "Bengaluru",
    locality: "Koramangala",
    checkin: "2026-12-10",
    checkout: "2026-12-12",
    nights: 2,
    guests: 1,
    lines: [{ room_type: "single", label: "Single room", units: 1, unit_price_inr: 300, nights: 2, line_total_inr: 600 }],
    stay_total_inr: 600,
    tax_percent: 5,
    tax_inr: 30,
    grand_total_inr: 630,
    guest_name: "Asha Rao",
    guest_phone: "9876543210",
    guest_email: "asha@example.com",
    special_requests: null,
    hold_expires_at: null,
    cancelled_at: null,
    cancel_reason: null,
    refund_inr: 0,
    refund_status: "none",
    free_cancel_until: "2026-12-03T07:30:00.000Z",
    created_at: "2026-11-19T06:00:00.000Z",
    ...overrides,
  };
}

describe("cancellation", () => {
  it("computes the free-cancel deadline as 7 days before check-in at 1 PM India time", () => {
    expect(freeCancelDeadline("2026-12-10")).toBe("2026-12-03T07:30:00.000Z");
  });

  it("refunds in full before the deadline and nothing after", () => {
    expect(refundPreview(booking(), Date.parse("2026-12-01T00:00:00Z"))).toBe("You get ₹630 back (100% of what you paid online).");
    expect(refundPreview(booking(), Date.parse("2026-12-04T00:00:00Z"))).toBe("Free cancellation has ended, so there is no refund.");
    expect(refundPreview(booking({ payment_mode: "at_property", paid: false }))).toMatch(/Nothing was charged/);
  });

  it("allows cancelling live bookings until check-in", () => {
    expect(canCancel(booking(), Date.parse("2026-12-10T07:00:00Z"))).toBe(true);
    expect(canCancel(booking(), Date.parse("2026-12-10T08:00:00Z"))).toBe(false);
    expect(canCancel(booking({ status: "cancelled" }), Date.parse("2026-12-01T00:00:00Z"))).toBe(false);
  });
});

describe("StayBookingView", () => {
  it("shows the confirmation, totals and actions", () => {
    renderWithProviders(<StayBookingView booking={booking()} />);
    expect(screen.getByText("Booking confirmed")).toBeInTheDocument();
    expect(screen.getByText("Tax (5%)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /share/i })).toHaveAttribute("href", expect.stringContaining("https://wa.me/?text="));
    expect(screen.getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();
    expect(screen.getByText(/Zovia confirms details with the property/)).toBeInTheDocument();
  });

  it("has proper copy for expired and cancelled bookings", () => {
    renderWithProviders(<StayBookingView booking={booking({ status: "expired", paid: false })} />);
    expect(screen.getByText("This booking expired")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book again" })).toHaveAttribute("href", "/properties/sunrise-pg?checkin=2026-12-10&checkout=2026-12-12&rooms=single%401");
    cleanup();
    renderWithProviders(
      <StayBookingView booking={booking({ status: "cancelled", cancelled_at: "2026-11-20T06:00:00Z", refund_inr: 630, refund_status: "refund_due" })} />,
    );
    expect(screen.getByText(/A refund of ₹630 is due/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel booking/i })).not.toBeInTheDocument();
  });
});

describe("unpaid hold", () => {
  const hold = () =>
    booking({
      status: "pending_payment",
      paid: false,
      hold_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });

  it("shows a countdown, Pay now and Cancel hold, and no receipt", () => {
    renderWithProviders(<StayBookingView booking={hold()} />);
    expect(screen.getByRole("timer")).toHaveTextContent(/Beds held for 9:\d\d|Beds held for 10:00/);
    expect(screen.getByRole("button", { name: "Pay now" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel hold" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Receipt" })).not.toBeInTheDocument();
  });

  it("Pay now asks the server for the order again, then confirms the payment", async () => {
    const proof = { razorpay_order_id: "order_1", razorpay_payment_id: "pay_1", razorpay_signature: "sig" };
    const open = vi.fn(function (this: unknown, options: { handler: (r: typeof proof) => void }) {
      return { on: vi.fn(), open: () => options.handler(proof) };
    });
    vi.stubGlobal("Razorpay", open);
    (window as unknown as { Razorpay: unknown }).Razorpay = open;
    const fetchMock = mockApi((url) => {
      if (url.pathname.endsWith("/pay")) {
        return ok({ booking: hold(), payment: { mode: "online", provider: "razorpay", key_id: "k", order_id: "order_1", amount_paise: 63000, currency: "INR", description: "d" } });
      }
      if (url.pathname.endsWith("/verify-payment")) return ok(booking());
      return undefined;
    });
    renderWithProviders(<StayBookingView booking={hold()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pay now" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/verify-payment"))).toBe(true));
    expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/stays\/bookings\/.+\/pay$/);
    expect(open).toHaveBeenCalledOnce();
    delete (window as unknown as { Razorpay?: unknown }).Razorpay;
    vi.unstubAllGlobals();
  });

  it("links the receipt for confirmed and cancelled bookings", () => {
    renderWithProviders(<StayBookingView booking={booking()} />);
    expect(screen.getByRole("link", { name: "Receipt" })).toHaveAttribute("href", `/bookings/${booking().id}/invoice`);
    cleanup();
    renderWithProviders(<StayBookingView booking={booking({ status: "cancelled" })} />);
    expect(screen.getByRole("link", { name: "Receipt" })).toBeInTheDocument();
  });
});

describe("calendar and list", () => {
  it("builds an .ics with India check-in and check-out times", () => {
    const ics = buildStayIcs(booking(), "https://zovia.test/bookings/x", new Date("2026-11-19T00:00:00Z"));
    expect(ics).toContain("DTSTART:20261210T073000Z");
    expect(ics).toContain("DTEND:20261212T043000Z");
    expect(ics).toContain("SUMMARY:Stay at Sunrise PG");
    expect(ics.split("\r\n")[0]).toBe("BEGIN:VCALENDAR");
  });

  it("merges both kinds of booking newest first", () => {
    const old = { id: "old", created_at: "2026-11-18T00:00:00Z" } as Booking;
    const newer = { id: "new", created_at: "2026-11-20T00:00:00Z" } as Booking;
    const rows = mergeBookings([booking()], [old, newer]);
    expect(rows.map((row) => row.booking.id)).toEqual(["new", booking().id, "old"]);
  });
});
