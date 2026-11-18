import { absoluteUrl } from "@/lib/site";
import { formatINR } from "@/lib/format";

import { formatClock, formatStayDate } from "./hooks/stay-text";
import { STAY_RULES, type StayBooking } from "./schemas";

/**
 * The stay booking receipt: one document, shown on /bookings/[id]/invoice and e-mailed to the guest.
 * The number is issued by the database the first time a booking is confirmed
 * (20261120000400_stay_invoices.sql); everything else is the booking's live state.
 *
 * It is a "Tax invoice" only when a legal name AND a GSTIN are configured (INVOICE_LEGAL_NAME,
 * INVOICE_GSTIN). Otherwise it is a "Booking confirmation and receipt", with tax as a plain line and
 * no invented business details. Pure: no I/O, so the page, the e-mail and the tests share it.
 */

export type StayInvoice = { invoice_no: string; issued_at: string; booking: StayBooking };

export type InvoiceIssuer = { legal_name: string | null; gstin: string | null; address: string | null };

export type InvoiceStatus = { label: string; detail: string; tone: "success" | "info" | "warning" };

export function isTaxInvoice(issuer: InvoiceIssuer): boolean {
  return Boolean(issuer.legal_name && issuer.gstin);
}

export function invoiceTitle(issuer: InvoiceIssuer): string {
  return isTaxInvoice(issuer) ? "Tax invoice" : "Booking confirmation and receipt";
}

export function invoiceUrl(bookingId: string): string {
  return absoluteUrl(`/bookings/${bookingId}/invoice`);
}

/** Whether the booking is confirmed, and what was paid or is due, in words. */
export function invoiceStatus(booking: StayBooking): InvoiceStatus {
  const total = formatINR(booking.grand_total_inr);
  switch (booking.status) {
    case "confirmed":
      return booking.paid
        ? { label: "Confirmed", detail: `Paid online: ${total}.`, tone: "success" }
        : booking.payment_mode === "at_property"
          ? { label: "Confirmed", detail: `Pay ${total} at the property when you check in. Nothing was charged online.`, tone: "success" }
          : { label: "Confirmed", detail: `Payment of ${total} is being confirmed.`, tone: "info" };
    case "completed":
      return { label: "Completed", detail: booking.paid ? `Paid online: ${total}.` : `Total ${total}, paid at the property.`, tone: "success" };
    case "cancelled":
      return { label: "Cancelled", detail: refundSentence(booking), tone: "warning" };
    case "expired":
      return { label: "Not confirmed", detail: "The payment was not completed in time, so the booking was not confirmed.", tone: "warning" };
    default:
      return { label: "Waiting for payment", detail: `Pay ${total} to confirm this booking.`, tone: "info" };
  }
}

function refundSentence(booking: StayBooking): string {
  if (!booking.paid) return "Nothing was charged.";
  const amount = formatINR(booking.refund_inr);
  switch (booking.refund_status) {
    case "refunded":
      return `${amount} was refunded to your payment method.`;
    case "pending":
      return `A refund of ${amount} is on its way (5 to 7 working days).`;
    case "refund_due":
      return `A refund of ${amount} is due; the Zovia team will send it.`;
    default:
      return "Free cancellation had ended, so nothing was refunded.";
  }
}

export function paymentModeLabel(booking: StayBooking): string {
  return booking.payment_mode === "at_property" ? "Pay at the property" : "Paid online (Razorpay)";
}

export const SAMPLE_NOTICE =
  "This is a sample listing on Zovia. Zovia confirms the price, the room and the house rules with the property before your stay.";

type Row = [label: string, value: string];

/** The facts of the stay, in display order. Shared by the page, the text and the HTML e-mail. */
export function invoiceRows(invoice: StayInvoice): { stay: Row[]; guest: Row[] } {
  const { booking } = invoice;
  const place = [booking.listing_title, booking.locality, booking.city].filter(Boolean).join(", ");
  return {
    stay: [
      ["Stay", place],
      ["Check-in", `${formatStayDate(booking.checkin, true)}, from ${formatClock(STAY_RULES.check_in_time)}`],
      ["Check-out", `${formatStayDate(booking.checkout, true)}, by ${formatClock(STAY_RULES.check_out_time)}`],
      ["Nights", String(booking.nights)],
      ["Guests (beds)", String(booking.guests)],
      ["Payment", paymentModeLabel(booking)],
      ["Booking reference", booking.id.slice(0, 8).toUpperCase()],
    ],
    guest: [
      ["Name", booking.guest_name],
      ["Mobile", booking.guest_phone],
      ["E-mail", booking.guest_email],
    ],
  };
}

export function invoiceLines(booking: StayBooking): Row[] {
  return [
    ...booking.lines.map((line): Row => [
      `${line.label} × ${line.units}, ${formatINR(line.unit_price_inr)} × ${line.nights} night${line.nights === 1 ? "" : "s"}`,
      formatINR(line.line_total_inr),
    ]),
    ["Stay total", formatINR(booking.stay_total_inr)],
    [`Tax (${booking.tax_percent}%)`, formatINR(booking.tax_inr)],
    ["Total", formatINR(booking.grand_total_inr)],
  ];
}

function issuedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

/** Plain-text receipt (the e-mail's text part). Guest-typed values never start a line of their own. */
export function buildInvoiceText(invoice: StayInvoice, issuer: InvoiceIssuer): string {
  const { booking } = invoice;
  const status = invoiceStatus(booking);
  const rows = invoiceRows(invoice);
  const pad = (rowsToPad: Row[]) => rowsToPad.map(([label, value]) => `${label}: ${oneLine(value)}`);
  return [
    `${invoiceTitle(issuer)} ${invoice.invoice_no}`,
    `Issued ${issuedLabel(invoice.issued_at)}`,
    ...(isTaxInvoice(issuer)
      ? [`${issuer.legal_name}, GSTIN ${issuer.gstin}${issuer.address ? `, ${oneLine(issuer.address)}` : ""}`]
      : []),
    "",
    `Status: ${status.label}. ${status.detail}`,
    "",
    ...pad(rows.stay),
    "",
    ...pad(invoiceLines(booking)),
    "",
    "Guest",
    ...pad(rows.guest),
    "",
    SAMPLE_NOTICE,
    `View or print: ${invoiceUrl(booking.id)}`,
  ].join("\n");
}

/** Collapses line breaks and control characters so a value cannot add lines to a text document. */
export function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** HTML receipt for e-mail: inline styles only (mail clients drop stylesheets), every value escaped. */
export function buildInvoiceHtml(invoice: StayInvoice, issuer: InvoiceIssuer): string {
  const { booking } = invoice;
  const status = invoiceStatus(booking);
  const rows = invoiceRows(invoice);
  const colour = { success: "#1d6b3a", info: "#1f4e79", warning: "#8a4b00" }[status.tone];
  const cell = "padding:6px 0;border-bottom:1px solid #e6e3da;vertical-align:top";
  const table = (items: Row[], boldLast = false) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">${items
      .map(
        ([label, value], index) =>
          `<tr><td style="${cell};color:#5c5a54">${escapeHtml(label)}</td><td style="${cell};text-align:right;${
            boldLast && index === items.length - 1 ? "font-weight:700" : ""
          }">${escapeHtml(oneLine(value))}</td></tr>`,
      )
      .join("")}</table>`;
  return `<!doctype html><html><body style="margin:0;background:#f6f4ee;font-family:Arial,Helvetica,sans-serif;color:#111111">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="background:#ffffff;border-radius:16px;padding:24px">
<p style="margin:0;font-size:13px;color:#5c5a54">Zovia</p>
<h1 style="margin:4px 0 0;font-size:20px">${escapeHtml(invoiceTitle(issuer))}</h1>
<p style="margin:4px 0 0;font-size:13px;color:#5c5a54">${escapeHtml(invoice.invoice_no)} · Issued ${escapeHtml(issuedLabel(invoice.issued_at))}</p>
${
  isTaxInvoice(issuer)
    ? `<p style="margin:8px 0 0;font-size:13px">${escapeHtml(issuer.legal_name ?? "")} · GSTIN ${escapeHtml(issuer.gstin ?? "")}${
        issuer.address ? `<br>${escapeHtml(oneLine(issuer.address))}` : ""
      }</p>`
    : ""
}
<p style="margin:16px 0;padding:12px;border-radius:12px;background:#f6f4ee;font-size:14px"><strong style="color:${colour}">${escapeHtml(
    status.label,
  )}</strong>. ${escapeHtml(status.detail)}</p>
${table(rows.stay)}
<h2 style="margin:20px 0 4px;font-size:15px">Price</h2>
${table(invoiceLines(booking), true)}
<h2 style="margin:20px 0 4px;font-size:15px">Guest</h2>
${table(rows.guest)}
<p style="margin:16px 0 0;font-size:12px;color:#5c5a54">${escapeHtml(SAMPLE_NOTICE)}</p>
<p style="margin:16px 0 0"><a href="${escapeHtml(invoiceUrl(booking.id))}" style="color:#111111;font-weight:700">View or print this receipt</a></p>
</div></div></body></html>`;
}
