import "server-only";

import { site } from "@/lib/site";
import { env } from "@/server/env";
import { logger } from "@/server/logger";

/**
 * Transactional e-mail behind one interface (spec section 8). The result always says what
 * really happened: "sent" only when the provider accepted the message.
 */
export type EmailMessage = {
  to: string | string[];
  subject: string;
  /** Plain-text body (always required; HTML is optional). */
  text: string;
  html?: string;
  replyTo?: string;
};

export type EmailResult =
  | { status: "sent"; provider: string; id: string | null }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; provider: string; error: string };

export interface EmailProvider {
  readonly name: "resend" | "none";
  send(message: EmailMessage): Promise<EmailResult>;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Resend REST API (POST /emails with a bearer key). No SDK. */
export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend" as const;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<EmailResult> {
    try {
      const response = await this.fetchImpl(RESEND_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.from,
          to: Array.isArray(message.to) ? message.to : [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { name?: unknown } | null;
        const kind = typeof payload?.name === "string" ? payload.name : "error";
        return { status: "failed", provider: this.name, error: `http_${response.status}_${kind}` };
      }
      const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
      return { status: "sent", provider: this.name, id: typeof payload?.id === "string" ? payload.id : null };
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      return { status: "failed", provider: this.name, error: name === "TimeoutError" ? "timeout" : "network_error" };
    }
  }
}

/** Used when e-mail is not configured: sends nothing, says so, and logs it. */
export class NoopEmailProvider implements EmailProvider {
  readonly name = "none" as const;

  async send(): Promise<EmailResult> {
    logger.info("mail.not_configured", {
      detail: "e-mail not configured (RESEND_API_KEY and EMAIL_FROM); nothing was sent",
    });
    return { status: "skipped", reason: "not_configured" };
  }
}

export function getEmailProvider(): EmailProvider {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  return RESEND_API_KEY && EMAIL_FROM ? new ResendEmailProvider(RESEND_API_KEY, EMAIL_FROM) : new NoopEmailProvider();
}

/** Inbox that receives contact-form messages and visit requests (NEXT_PUBLIC_CONTACT_INBOX). */
export function contactInbox(): string {
  return site.contactInbox;
}

const FORMSUBMIT_ENDPOINT = "https://formsubmit.co/ajax/";

/**
 * FormSubmit (formsubmit.co): forwards a message to an inbox with no API key. The first message
 * to a new inbox sends that inbox a one-time "Activate form" e-mail; until it is clicked,
 * delivery reports `needs_activation`.
 */
export class FormSubmitEmailProvider {
  readonly name = "formsubmit" as const;

  constructor(
    private readonly siteUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage & { fromName: string }): Promise<EmailResult> {
    const to = Array.isArray(message.to) ? message.to[0] : message.to;
    try {
      const response = await this.fetchImpl(`${FORMSUBMIT_ENDPOINT}${encodeURIComponent(to ?? "")}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Origin: this.siteUrl,
          Referer: `${this.siteUrl}/contact`,
        },
        body: JSON.stringify({
          name: message.fromName,
          email: message.replyTo,
          _replyto: message.replyTo,
          _subject: message.subject,
          _template: "table",
          _captcha: "false",
          message: message.text,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      const payload = (await response.json().catch(() => null)) as { success?: unknown; message?: unknown } | null;
      if (response.ok && String(payload?.success) === "true") return { status: "sent", provider: this.name, id: null };
      const detail = typeof payload?.message === "string" ? payload.message : "";
      return {
        status: "failed",
        provider: this.name,
        error: /activat/i.test(detail) ? "needs_activation" : `http_${response.status}`,
      };
    } catch (error) {
      const name = error instanceof Error ? error.name : "Error";
      return { status: "failed", provider: this.name, error: name === "TimeoutError" ? "timeout" : "network_error" };
    }
  }
}

export type TeamMessage = { fromName: string; fromEmail: string; subject: string; text: string };

/**
 * Delivers a visitor's message to the contact inbox with the visitor as Reply-To, so replying
 * from the inbox answers them directly. Resend is tried first when configured (it can only reach
 * the account owner's own address until a domain is verified), then FormSubmit.
 */
export async function deliverToTeam(message: TeamMessage): Promise<EmailResult> {
  const to = contactInbox();
  const mail: EmailMessage = { to, replyTo: message.fromEmail, subject: message.subject, text: message.text };
  const attempts: EmailResult[] = [];

  const resend = getEmailProvider();
  if (resend.name === "resend") {
    const result = await resend.send(mail);
    if (result.status === "sent") return result;
    attempts.push(result);
    logger.warn("mail.resend_failed", { error: result.status === "failed" ? result.error : result.status });
  }

  const fallback = await new FormSubmitEmailProvider(env().NEXT_PUBLIC_SITE_URL).send({ ...mail, fromName: message.fromName });
  if (fallback.status !== "sent") logger.warn("mail.formsubmit_failed", { error: fallback.status === "failed" ? fallback.error : fallback.status });
  return fallback.status === "sent" ? fallback : (attempts[0] ?? fallback);
}
