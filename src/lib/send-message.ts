/**
 * Sends a visitor's message (contact form, PG visit request) to the Zovia inbox.
 *
 * Only the server route delivers it (e-mail with the visitor as Reply-To, plus a stored copy for the
 * developer's admin inbox). The destination address is server-side only and never reaches the
 * browser.
 */
export type OutgoingMessage = { name: string; email: string; phone?: string; subject: string; message: string; website?: string };

export type SendOutcome =
  /** `emailed` is true when the message really reached the inbox by e-mail; false when it was only saved. */
  | { ok: true; emailed: boolean }
  | { ok: false; status: number; code?: string; message?: string; details?: unknown; requestId?: string };

/** First message for `field` in a validation error's `details.fieldErrors`, or null when there is none. */
export function fieldError(details: unknown, field: string): string | null {
  if (typeof details !== "object" || details === null) return null;
  const fieldErrors = (details as { fieldErrors?: unknown }).fieldErrors;
  if (typeof fieldErrors !== "object" || fieldErrors === null) return null;
  const messages = (fieldErrors as Record<string, unknown>)[field];
  return Array.isArray(messages) && typeof messages[0] === "string" ? messages[0] : null;
}

type Envelope =
  | { ok: true; data?: unknown }
  | { ok: false; error?: { code?: string; message?: string; details?: unknown; request_id?: string } };

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
    const data = envelope.data as { team_notified?: unknown } | undefined;
    return { ok: true, emailed: data?.team_notified === true };
  }

  const status = response?.status ?? 0;
  const error = envelope && !envelope.ok ? envelope.error : undefined;
  return { ok: false, status, code: error?.code, message: error?.message, details: error?.details, requestId: error?.request_id };
}
