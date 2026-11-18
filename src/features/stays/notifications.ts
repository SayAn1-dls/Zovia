import { absoluteUrl } from "@/lib/site";
import { deliverToTeam, getEmailProvider, type EmailMessage, type EmailProvider } from "@/server/email";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

import { buildInvoiceHtml, buildInvoiceText, invoiceStatus, oneLine, type InvoiceIssuer, type StayInvoice } from "./invoice";
import { loadInvoiceForEmail } from "./invoice-store";
import { STAY_RULES, type StayBooking } from "./schemas";

/**
 * Stay booking e-mails (pure builders) and best-effort delivery.
 *   created    a booking was made (pay at the property: it is confirmed at once)
 *   confirmed  an online payment was captured and the booking confirmed
 *   cancelled  the guest cancelled (or Zovia released it)
 * The team always gets the full summary. The guest gets the receipt (confirmed or not) when a sender
 * that can reach any address is configured (Resend with a verified domain).
 */

export type StayEvent = "created" | "confirmed" | "cancelled";

const inr = (value: number) => `Rs ${value.toLocaleString("en-IN")}`;

function dateLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function linesText(booking: StayBooking): string[] {
  return booking.lines.map(
    (line) =>
      `${line.label} x ${line.units}: ${inr(line.unit_price_inr)} x ${line.nights} night${line.nights === 1 ? "" : "s"} = ${inr(line.line_total_inr)}`,
  );
}

function totalsText(booking: StayBooking): string[] {
  return [
    `Stay total: ${inr(booking.stay_total_inr)}`,
    `Tax (${booking.tax_percent}%): ${inr(booking.tax_inr)}`,
    `Grand total: ${inr(booking.grand_total_inr)}`,
  ];
}

function paymentText(booking: StayBooking): string {
  if (booking.payment_mode === "at_property") return "Pay at the property";
  return booking.paid ? "Paid online" : "Online payment, not paid yet";
}

function refundText(booking: StayBooking): string {
  if (booking.status !== "cancelled") return "";
  if (booking.payment_mode === "at_property") return "Refund: none (nothing was paid online)";
  if (booking.refund_inr <= 0) return "Refund: none (cancelled inside the free cancellation window)";
  const state =
    booking.refund_status === "refunded" ? "refunded" : booking.refund_status === "refund_due" ? "due, team to process" : "pending";
  return `Refund: ${inr(booking.refund_inr)} (${state})`;
}

/** Guest-typed text, quoted line by line so it can never pass for one of our own fields. */
function quoted(value: string | null | undefined): string[] {
  const text = (value ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim();
  return text ? text.split(/\r?\n/).map((line) => `> ${line}`) : ["> (none)"];
}

export function bookingUrl(booking: Pick<StayBooking, "id">): string {
  return absoluteUrl(`/bookings/${booking.id}`);
}

const TEAM_HEADLINE: Record<StayEvent, string> = {
  created: "New stay booking",
  confirmed: "Stay booking paid and confirmed",
  cancelled: "Stay booking cancelled",
};

/**
 * Team e-mail: our own fields first (status, dates, money), then what the guest typed, quoted.
 * Reply-To is the guest (deliverToTeam).
 */
export function buildTeamEmail(event: StayEvent, booking: StayBooking): { subject: string; text: string } {
  const verb = TEAM_HEADLINE[event];
  const subject = `${verb}: ${booking.listing_title}, ${dateLabel(booking.checkin)} (${booking.id.slice(0, 8)})`;
  const text = [
    `${verb}`,
    "",
    `Reference: ${booking.id}`,
    `Status: ${booking.status}`,
    `Payment: ${paymentText(booking)}`,
    ...(event === "cancelled" ? [refundText(booking)] : []),
    `Listing: ${booking.listing_title}, ${booking.locality}, ${booking.city} (${booking.listing})`,
    `Check-in: ${dateLabel(booking.checkin)} from ${STAY_RULES.check_in_time}`,
    `Check-out: ${dateLabel(booking.checkout)} by ${STAY_RULES.check_out_time}`,
    `Nights: ${booking.nights}`,
    `Guests (beds): ${booking.guests}`,
    "",
    ...linesText(booking),
    "",
    ...totalsText(booking),
    "",
    `Guest phone: ${booking.guest_phone}`,
    `Guest e-mail: ${booking.guest_email}`,
    `Manage: ${bookingUrl(booking)}`,
    "",
    "Guest name, as typed:",
    ...quoted(booking.guest_name),
    "Special requests, as typed:",
    ...quoted(booking.special_requests),
    ...(event === "cancelled" ? ["Cancel reason, as typed:", ...quoted(booking.cancel_reason)] : []),
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");
  return { subject, text };
}

/** Business details for the receipt; a "Tax invoice" needs both the legal name and the GSTIN. */
export function invoiceIssuer(): InvoiceIssuer {
  try {
    const config = env();
    return {
      legal_name: config.INVOICE_LEGAL_NAME ?? null,
      gstin: config.INVOICE_GSTIN ?? null,
      address: config.INVOICE_ADDRESS ?? null,
    };
  } catch {
    return { legal_name: null, gstin: null, address: null };
  }
}

/**
 * Guest e-mail. With a receipt it is the receipt (subject says whether the booking is confirmed);
 * without one (cancelled before it was ever confirmed) a short status note.
 */
export function buildGuestEmail(
  event: StayEvent,
  booking: StayBooking,
  invoice: StayInvoice | null = null,
  issuer: InvoiceIssuer = { legal_name: null, gstin: null, address: null },
): { subject: string; text: string; html?: string } {
  const status = invoiceStatus(booking);
  const head = event === "cancelled" ? "Booking cancelled" : status.label === "Confirmed" ? "Booking confirmed" : `Booking ${status.label.toLowerCase()}`;
  const subject = `${head}: ${booking.listing_title} (${booking.id.slice(0, 8).toUpperCase()})`;
  if (invoice) {
    return {
      subject,
      text: `Hi ${oneLine(booking.guest_name)},\n\n${buildInvoiceText(invoice, issuer)}`,
      html: buildInvoiceHtml(invoice, issuer),
    };
  }
  const text = [
    `Hi ${oneLine(booking.guest_name)},`,
    "",
    `${status.label}. ${status.detail}`,
    `${booking.listing_title}, ${booking.locality}, ${booking.city}`,
    `Check-in ${dateLabel(booking.checkin)} from ${STAY_RULES.check_in_time}, check-out ${dateLabel(booking.checkout)} by ${STAY_RULES.check_out_time}.`,
    ...linesText(booking),
    ...totalsText(booking),
    "",
    `Manage your booking: ${bookingUrl(booking)}`,
  ].join("\n");
  return { subject, text };
}

/** Which events send the guest an e-mail: only when the booking is (or was) settled, never for a bare hold. */
function guestShouldHear(event: StayEvent, booking: StayBooking): boolean {
  if (event === "created") return booking.status === "confirmed";
  return true;
}

export type NotifyDeps = {
  deliverToTeam: typeof deliverToTeam;
  emailProvider: () => Pick<EmailProvider, "name" | "send">;
  loadInvoice: (bookingId: string) => Promise<StayInvoice | null>;
  issuer: () => InvoiceIssuer;
};

const defaultDeps: NotifyDeps = { deliverToTeam, emailProvider: getEmailProvider, loadInvoice: loadInvoiceForEmail, issuer: invoiceIssuer };

/**
 * Best-effort: never throws. Team e-mail always; guest receipt only with a configured provider.
 * Returns what actually happened so callers and tests can see it.
 */
export async function notifyStayEvent(
  event: StayEvent,
  booking: StayBooking,
  overrides: Partial<NotifyDeps> = {},
): Promise<{ team: "sent" | "failed"; guest: "sent" | "failed" | "skipped" }> {
  const deps = { ...defaultDeps, ...overrides };
  const outcome = { team: "failed", guest: "skipped" } as { team: "sent" | "failed"; guest: "sent" | "failed" | "skipped" };
  try {
    const mail = buildTeamEmail(event, booking);
    const result = await deps.deliverToTeam({
      fromName: oneLine(booking.guest_name),
      fromEmail: booking.guest_email,
      subject: mail.subject,
      text: mail.text,
    });
    outcome.team = result.status === "sent" ? "sent" : "failed";
    if (result.status !== "sent") logger.warn("stays.team_mail_not_sent", { booking_id: booking.id, status: result.status });
  } catch (error) {
    logger.warn("stays.team_mail_error", { booking_id: booking.id, error: error instanceof Error ? error.name : "unknown" });
  }
  try {
    const provider = deps.emailProvider();
    if (provider.name === "resend" && guestShouldHear(event, booking)) {
      const invoice = await deps.loadInvoice(booking.id).catch(() => null);
      const mail = buildGuestEmail(event, invoice?.booking ?? booking, invoice, deps.issuer());
      const message: EmailMessage = { to: booking.guest_email, subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) };
      const result = await provider.send(message);
      outcome.guest = result.status === "sent" ? "sent" : "failed";
      if (result.status !== "sent") logger.warn("stays.guest_mail_not_sent", { booking_id: booking.id, status: result.status });
    }
  } catch (error) {
    outcome.guest = "failed";
    logger.warn("stays.guest_mail_error", { booking_id: booking.id, error: error instanceof Error ? error.name : "unknown" });
  }
  return outcome;
}
