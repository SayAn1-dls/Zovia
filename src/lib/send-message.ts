/**
 * Sends a visitor's message (contact form, PG visit request) to the Zovia inbox.
 *
 * Only the server route delivers it (e-mail with the visitor as Reply-To, plus a stored copy for the
 * developer's admin inbox). The destination address is server-side only and never reaches the
 * browser.
 */
export type OutgoingMessage = { name: string; email: string; phone?: string; subject: string; message: string; website?: string };

export type SendOutcome =
  | { ok: true }
  | { ok: false; status: number; code?: string; message?: string; details?: unknown; requestId?: string };

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

  if (response?.ok && envelope?.ok) return { ok: true };

  const status = response?.status ?? 0;
  const error = envelope && !envelope.ok ? envelope.error : undefined;
  return { ok: false, status, code: error?.code, message: error?.message, details: error?.details, requestId: error?.request_id };
}
