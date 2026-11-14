import { site } from "@/lib/site";

/**
 * Sends a visitor's message (contact form, PG visit request) to the Zovia inbox.
 *
 * The server route e-mails it with the visitor as Reply-To and stores it when the database is up.
 * If the server could not e-mail it (provider down, not configured), the browser forwards it
 * through FormSubmit directly, which works from any visitor's browser without a key.
 */
export type OutgoingMessage = { name: string; email: string; phone?: string; subject: string; message: string; website?: string };

export type SendOutcome =
  | { ok: true }
  | { ok: false; status: number; code?: string; message?: string; details?: unknown; requestId?: string };

type Envelope =
  | { ok: true; data?: { team_notified?: boolean } }
  | { ok: false; error?: { code?: string; message?: string; details?: unknown; request_id?: string } };

async function sendFromBrowser(payload: OutgoingMessage): Promise<boolean> {
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(site.contactInbox)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        _replyto: payload.email,
        _subject: `[Zovia] ${payload.subject}`,
        _template: "table",
        _captcha: "false",
        phone: payload.phone ?? "not given",
        message: payload.message,
      }),
    });
    const body = (await response.json().catch(() => null)) as { success?: unknown } | null;
    return response.ok && String(body?.success) === "true";
  } catch {
    return false;
  }
}

export async function sendMessage(payload: OutgoingMessage): Promise<SendOutcome> {
  let response: Response | null = null;
  let envelope: Envelope | null = null;
  try {
    response = await fetch("/api/v1/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    envelope = (await response.json().catch(() => null)) as Envelope | null;
  } catch {
    response = null;
  }

  if (response?.ok && envelope?.ok) {
    if (envelope.data?.team_notified === false) await sendFromBrowser(payload);
    return { ok: true };
  }

  const status = response?.status ?? 0;
  const error = envelope && !envelope.ok ? envelope.error : undefined;
  // The visitor has to fix something (or wait): don't route around the server's answer.
  if (status === 400 || status === 413 || status === 422 || status === 429) {
    return { ok: false, status, code: error?.code, message: error?.message, details: error?.details, requestId: error?.request_id };
  }
  if (await sendFromBrowser(payload)) return { ok: true };
  return { ok: false, status, code: error?.code, message: error?.message, requestId: error?.request_id };
}
