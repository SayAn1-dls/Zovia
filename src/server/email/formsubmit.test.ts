import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FormSubmitEmailProvider } from "./index";

const message = { to: "inbox@example.com", replyTo: "visitor@example.com", subject: "Hi", text: "Hello there", fromName: "Asha" };

describe("FormSubmitEmailProvider", () => {
  it("posts the message with the visitor as reply-to and reports success", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ success: "true" }), { status: 200 }));
    const result = await new FormSubmitEmailProvider("https://zovia.example", fetchImpl as unknown as typeof fetch).send(message);
    expect(result.status).toBe("sent");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://formsubmit.co/ajax/inbox%40example.com");
    expect(JSON.parse(String(init.body))).toMatchObject({ _replyto: "visitor@example.com", _subject: "Hi", name: "Asha" });
  });

  it("reports an inbox that still needs activation", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ success: "false", message: "This form needs Activation." }), { status: 200 }),
    );
    const result = await new FormSubmitEmailProvider("https://zovia.example", fetchImpl as unknown as typeof fetch).send(message);
    expect(result).toEqual({ status: "failed", provider: "formsubmit", error: "needs_activation" });
  });

  it("reports network failures", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const result = await new FormSubmitEmailProvider("https://zovia.example", fetchImpl as unknown as typeof fetch).send(message);
    expect(result).toEqual({ status: "failed", provider: "formsubmit", error: "network_error" });
  });
});
