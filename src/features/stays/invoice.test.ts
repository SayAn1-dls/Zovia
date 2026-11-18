// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildInvoiceHtml,
  buildInvoiceText,
  escapeHtml,
  invoiceLines,
  invoiceStatus,
  invoiceTitle,
  oneLine,
  type InvoiceIssuer,
  type StayInvoice,
} from "./invoice";
import type { StayBooking } from "./schemas";

const booking: StayBooking = {
  id: "11111111-2222-4333-8444-555555555555",
  status: "confirmed",
  payment_mode: "online",
  paid: true,
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
  special_requests: null,
  hold_expires_at: null,
  cancelled_at: null,
  cancel_reason: null,
  refund_inr: 0,
  refund_status: "none",
  free_cancel_until: null,
  created_at: "2026-11-19T00:00:00Z",
};
const invoice: StayInvoice = { invoice_no: "ZV-202611-000042", issued_at: "2026-11-19T06:00:00Z", booking };
const noIssuer: InvoiceIssuer = { legal_name: null, gstin: null, address: null };

describe("invoice title", () => {
  it("is a receipt unless both a legal name and a GSTIN are configured", () => {
    expect(invoiceTitle(noIssuer)).toBe("Booking confirmation and receipt");
    expect(invoiceTitle({ legal_name: "Zovia Pvt Ltd", gstin: null, address: null })).toBe("Booking confirmation and receipt");
    expect(invoiceTitle({ legal_name: "Zovia Pvt Ltd", gstin: "29ABCDE1234F1Z5", address: null })).toBe("Tax invoice");
  });
});

describe("invoice status", () => {
  it("says whether the booking is confirmed, and how it is paid", () => {
    expect(invoiceStatus(booking)).toMatchObject({ label: "Confirmed", detail: "Paid online: ₹1,890." });
    expect(invoiceStatus({ ...booking, payment_mode: "at_property", paid: false }).detail).toContain("at the property");
    expect(invoiceStatus({ ...booking, status: "expired" }).label).toBe("Not confirmed");
    expect(invoiceStatus({ ...booking, status: "pending_payment", paid: false }).label).toBe("Waiting for payment");
  });
  it("gives the refund state of a cancelled booking", () => {
    const cancelled = { ...booking, status: "cancelled" as const, refund_inr: 1890 };
    expect(invoiceStatus({ ...cancelled, refund_status: "refund_due" }).detail).toContain("is due");
    expect(invoiceStatus({ ...cancelled, refund_status: "refunded" }).detail).toContain("was refunded");
    expect(invoiceStatus({ ...cancelled, refund_inr: 0, refund_status: "none" }).detail).toContain("nothing was refunded");
    expect(invoiceStatus({ ...cancelled, paid: false, payment_mode: "at_property" }).detail).toBe("Nothing was charged.");
  });
});

describe("invoice documents", () => {
  it("lists every line, tax and the total", () => {
    expect(invoiceLines(booking).map(([label]) => label)).toEqual([
      "Double sharing × 2, ₹300 × 3 nights",
      "Stay total",
      "Tax (5%)",
      "Total",
    ]);
  });
  it("text: number, status, sample notice; no GSTIN when none is configured", () => {
    const text = buildInvoiceText(invoice, noIssuer);
    expect(text).toContain("Booking confirmation and receipt ZV-202611-000042");
    expect(text).toContain("Status: Confirmed. Paid online");
    expect(text).toContain("sample listing");
    expect(text).not.toContain("GSTIN");
  });
  it("text: a guest name cannot add lines", () => {
    const text = buildInvoiceText({ ...invoice, booking: { ...booking, guest_name: "Asha\nStatus: Refunded" } }, noIssuer);
    expect(text.split("\n").filter((line) => line.startsWith("Status:"))).toHaveLength(1);
  });
  it("html escapes guest-typed values", () => {
    const html = buildInvoiceHtml({ ...invoice, booking: { ...booking, guest_name: '<img src=x onerror="alert(1)">' } }, noIssuer);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
  it("helpers", () => {
    expect(oneLine(" a\r\nb\tc ")).toBe("a b c");
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
