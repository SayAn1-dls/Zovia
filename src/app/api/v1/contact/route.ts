import { deliverToTeam } from "@/server/email";
import { createHandler, created, errors } from "@/server/http";
import { serializeError } from "@/server/logger";

import { contactBodySchema } from "./schema";

/**
 * POST /api/v1/contact: public contact form, also used for PG visit requests.
 *
 * The message is e-mailed to the contact inbox (NEXT_PUBLIC_CONTACT_INBOX, default the developer's address)
 * with the visitor's address as Reply-To, so a reply from the inbox goes straight back to them.
 * It is also stored through `submit_contact_message()` for the admin inbox when the database is
 * reachable. Success means at least one of the two really happened; `team_notified` says whether
 * the e-mail went out. Per-IP throttling: preset "contact".
 *
 * Honeypot: a filled `website` field is refused with 422 and nothing is stored or sent. It is
 * NOT answered with a fake success, so a person whose browser auto-filled the hidden field is
 * told the message did not go through.
 */
export const POST = createHandler(
  { auth: "public", rateLimit: "contact", label: "contact.submit", body: contactBodySchema, maxBodyBytes: 20_000 },
  async ({ body, supabase, log }) => {
    if (body.website && body.website.trim() !== "") {
      log.warn("contact.honeypot_filled");
      throw errors.validation(
        { formErrors: ["Your message could not be accepted. Please reload the page and try again."], fieldErrors: {} },
        "Your message could not be accepted. Please reload the page and try again.",
      );
    }

    let id: string | null = null;
    try {
      const { data, error } = await supabase.rpc("submit_contact_message", {
        p_name: body.name,
        p_email: body.email,
        // The generated type marks p_phone as string; the function accepts null (optional phone).
        p_phone: body.phone as string,
        p_subject: body.subject,
        p_message: body.message,
      });
      if (error) throw error;
      id = data;
    } catch (cause) {
      log.warn("contact.store_failed", { error: serializeError(cause) });
    }

    const delivery = await deliverToTeam({
      fromName: body.name,
      fromEmail: body.email,
      subject: `[Zovia] ${body.subject}`,
      text: [
        `From: ${body.name} <${body.email}>`,
        `Phone: ${body.phone ?? "not given"}`,
        ...(id ? [`Reference: ${id}`] : []),
        "",
        body.message,
        "",
        "Reply to this e-mail to answer the sender directly.",
      ].join("\n"),
    });
    const teamNotified = delivery.status === "sent";
    log.info("contact.team_notification", {
      outcome: delivery.status,
      provider: delivery.status === "skipped" ? "none" : delivery.provider,
      ...(delivery.status === "failed" ? { reason: delivery.error } : {}),
    });

    if (!teamNotified && !id) {
      throw errors.unavailable("We couldn't send your message right now. Please try again in a minute.");
    }
    return created({ id, team_notified: teamNotified });
  },
);
