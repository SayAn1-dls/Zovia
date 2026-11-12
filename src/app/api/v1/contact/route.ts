import { env } from "@/server/env";
import { getEmailProvider } from "@/server/email";
import { createHandler, created, errors, unwrap } from "@/server/http";

import { contactBodySchema } from "./schema";

/**
 * POST /api/v1/contact: public contact form.
 *
 * Stored through `submit_contact_message()` with the cookieless anon client (nobody can insert
 * into `contact_messages` directly). Throttling is layered: this route (per IP, preset
 * "contact") and the SQL function (per e-mail address per hour, plus a global hourly cap), whose
 * ZV429 becomes HTTP 429.
 *
 * Honeypot: a filled `website` field is refused with 422 and nothing is stored. It is NOT
 * answered with a fake success, so a person whose browser auto-filled the hidden field is told
 * the message did not go through.
 *
 * When Resend, EMAIL_FROM and NEXT_PUBLIC_SUPPORT_EMAIL are all configured the team is also
 * notified by e-mail. The stored row is the source of truth; `team_notified` reports what really
 * happened to the notification.
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

    const id = unwrap(
      await supabase.rpc("submit_contact_message", {
        p_name: body.name,
        p_email: body.email,
        // The generated type marks p_phone as string; the function accepts null (optional phone).
        p_phone: body.phone as string,
        p_subject: body.subject,
        p_message: body.message,
      }),
    );

    let teamNotified = false;
    const supportAddress = env().NEXT_PUBLIC_SUPPORT_EMAIL;
    if (supportAddress) {
      const result = await getEmailProvider().send({
        to: supportAddress,
        replyTo: body.email,
        subject: `[ZUVIO contact] ${body.subject}`,
        text: [
          `From: ${body.name} <${body.email}>`,
          `Phone: ${body.phone ?? "not given"}`,
          `Reference: ${id}`,
          "",
          body.message,
        ].join("\n"),
      });
      teamNotified = result.status === "sent";
      if (result.status === "failed") {
        log.error("contact.team_notification_failed", { provider: result.provider, reason: result.error });
      } else {
        log.info("contact.team_notification", { outcome: result.status });
      }
    } else {
      log.info("contact.team_notification", { outcome: "skipped", detail: "support address not configured" });
    }

    return created({ id, team_notified: teamNotified });
  },
);
