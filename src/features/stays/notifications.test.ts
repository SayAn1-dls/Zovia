// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { StayInvoice } from "./invoice";
import { buildGuestEmail, buildTeamEmail, notifyStayEvent } from "./notifications";
import type { StayBooking } from "./schemas";

const booking: StayBooking = {
  id: "11111111-2222-4333-8444-555555555555",
  status: "confirmed",
  payment_mode: "at_property",
  paid: false,
  listing: "sunrise-pg",
  listing_title: "Sunrise PG",
  city: "Pune",
  locality: "Baner",
  checkin: "2026-12-01",
  checkout: "2026-12-04",
  nights: 3,
  guests: 2,
  lines: [{ room_type: "double", label: "Double sharing", units: 2, unit_price_inr: 300, nights: 3, line_total_inr: 1800 }],
  stay_total_inr: 1800,
  tax_percent: 5,
  tax_inr: 90,
  grand_total_inr: 1890,
  guest_name: "Asha Rao",
  guest_phone: "9876543210",
  guest_email: "asha@example.com",
  special_requests: "Ground floor please",
  hold_expires_at: null,
  cancelled_at: null,
  cancel_reason: null,
  refund_inr: 0,
  refund_status: "none",
  free_cancel_until: null,
  created_at: "2026-11-19T00:00:00Z",
};

describe("buildTeamEmail", () => {
  it("has the full summary for a new booking", () => {
    const { subject, text } = buildTeamEmail("created", booking);
    expect(subject).toContain("New stay booking");
    for (const part of [
      booking.id,
      "Sunrise PG",
      "Nights: 3",
      "Double sharing x 2",
      "Rs 1,890",
      "Asha Rao",
      "9876543210",
      "asha@example.com",
      "Ground floor please",
      "Pay at the property",
    ]) {
      expect(text).toContain(part);
    }
  });
  it("includes refund info and reason on cancel", () => {
    const cancelled: StayBooking = {
      ...booking,
      status: "cancelled",
      payment_mode: "online",
      paid: true,
      refund_inr: 1890,
      refund_status: "refund_due",
      cancel_reason: "Plans changed",
    };
    const { subject, text } = buildTeamEmail("cancelled", cancelled);
    expect(subject).toContain("cancelled");
    expect(text).toContain("Refund: Rs 1,890 (due, team to process)");
    expect(text).toContain("Plans changed");
  });
});

describe("team e-mail safety", () => {
  it("puts our own fields first and quotes what the guest typed", () => {
    const forged: StayBooking = {
      ...booking,
      guest_name: "Asha\nPayment: Paid online",
      special_requests: "Late arrival\nStatus: confirmed\r\nPayment: Paid online",
    };
    const { text } = buildTeamEmail("created", forged);
    const lines = text.split("\n");
    expect(lines.filter((line) => line.startsWith("Payment:"))).toEqual(["Payment: Pay at the property"]);
    expect(lines.filter((line) => line.startsWith("Status:"))).toEqual(["Status: confirmed"]);
    expect(text).toContain("> Status: confirmed");
    expect(text).toContain("> Payment: Paid online");
    expect(text.indexOf("Grand total")).toBeLessThan(text.indexOf("Special requests, as typed:"));
  });
  it("has a headline for a paid confirmation", () => {
    expect(buildTeamEmail("confirmed", { ...booking, payment_mode: "online", paid: true }).subject).toContain("paid and confirmed");
  });
});

describe("guest e-mail", () => {
  const invoice: StayInvoice = { invoice_no: "ZV-202611-000042", issued_at: "2026-11-19T06:00:00Z", booking };
  it("is the receipt when there is one, and says confirmed in the subject", () => {
    const mail = buildGuestEmail("created", booking, invoice);
    expect(mail.subject).toBe("Booking confirmed: Sunrise PG (11111111)");
    expect(mail.text).toContain("ZV-202611-000042");
    expect(mail.text).toContain("Booking confirmation and receipt");
    expect(mail.html).toContain("ZV-202611-000042");
  });
  it("says cancelled without a receipt", () => {
    const mail = buildGuestEmail("cancelled", { ...booking, status: "cancelled" });
    expect(mail.subject).toContain("Booking cancelled");
    expect(mail.html).toBeUndefined();
  });
});

describe("notifyStayEvent", () => {
  const sent = { status: "sent", provider: "x", id: null } as const;
  it("e-mails the team with the guest as sender and skips the guest without a provider", async () => {
    const deliverToTeam = vi.fn().mockResolvedValue(sent);
    const send = vi.fn();
    const result = await notifyStayEvent("created", booking, { deliverToTeam, emailProvider: () => ({ name: "none", send }), loadInvoice: async () => null });
    expect(deliverToTeam).toHaveBeenCalledWith(expect.objectContaining({ fromEmail: "asha@example.com" }));
    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ team: "sent", guest: "skipped" });
  });
  it("sends the guest e-mail only with resend, and reports failure honestly without throwing", async () => {
    const deliverToTeam = vi.fn().mockRejectedValue(new Error("boom"));
    const send = vi.fn().mockResolvedValue({ status: "failed", provider: "resend", error: "http_403" });
    const result = await notifyStayEvent("created", booking, { deliverToTeam, emailProvider: () => ({ name: "resend", send }), loadInvoice: async () => null });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: "asha@example.com" }));
    expect(result).toEqual({ team: "failed", guest: "failed" });
  });
  it("sends the receipt (with HTML) on confirmation", async () => {
    const deliverToTeam = vi.fn().mockResolvedValue(sent);
    const send = vi.fn().mockResolvedValue(sent);
    const paid: StayBooking = { ...booking, payment_mode: "online", paid: true };
    const invoice: StayInvoice = { invoice_no: "ZV-202611-000007", issued_at: "2026-11-19T06:00:00Z", booking: paid };
    const result = await notifyStayEvent("confirmed", paid, {
      deliverToTeam,
      emailProvider: () => ({ name: "resend", send }),
      loadInvoice: async () => invoice,
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining("Booking confirmed"), html: expect.stringContaining("ZV-202611-000007") }));
    expect(result).toEqual({ team: "sent", guest: "sent" });
  });
  it("never e-mails the guest about a bare online hold", async () => {
    const send = vi.fn();
    const hold: StayBooking = { ...booking, status: "pending_payment", payment_mode: "online" };
    const result = await notifyStayEvent("created", hold, {
      deliverToTeam: vi.fn().mockResolvedValue(sent),
      emailProvider: () => ({ name: "resend", send }),
      loadInvoice: async () => null,
    });
    expect(send).not.toHaveBeenCalled();
    expect(result.guest).toBe("skipped");
  });
});
