import "server-only";

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
