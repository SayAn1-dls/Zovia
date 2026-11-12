import { describe, expect, it } from "vitest";

import { parseSendResult, toChatMessage, toPage } from "./mappers";
import { contactWarning, sendMessageSchema } from "./schemas";

describe("toPage", () => {
  it("reverses newest-first pages into chronological order and detects more rows", () => {
    expect(toPage([3, 2, 1], 2, true)).toEqual({ items: [2, 3], has_more: true });
    expect(toPage([1, 2], 2, false)).toEqual({ items: [1, 2], has_more: false });
  });
});

describe("toChatMessage", () => {
  it("attaches signed URLs to attachments and leaves unknown ones null", () => {
    const message = toChatMessage(
      {
        id: "m1",
        conversation_id: "c1",
        sender_id: "u1",
        kind: "image",
        body: "",
        moderation: "clean",
        created_at: "2026-11-12T10:00:00+00:00",
        message_attachments: [
          { id: "a1", storage_path: "c1/u1/x.webp", mime_type: "image/webp", width: 10, height: 10 },
          { id: "a2", storage_path: "c1/u1/y.webp", mime_type: "image/webp", width: null, height: null },
        ],
      },
      new Map([["c1/u1/x.webp", "https://signed"]]),
    );
    expect(message.attachments.map((a) => a.url)).toEqual(["https://signed", null]);
  });
});

describe("parseSendResult", () => {
  it("maps a blocked send to a warning without the message", () => {
    const result = parseSendResult({ status: "blocked", kinds: ["phone", "bogus"], restricted: false, violations: 1, threshold: 3 });
    expect(result).toMatchObject({ status: "blocked", kinds: ["phone"], restricted: false });
    if (result.status === "blocked") expect(result.warning).toMatch(/phone numbers/);
  });

  it("maps a delivered message", () => {
    const result = parseSendResult({
      status: "sent",
      message: { id: "m1", conversation_id: "c1", sender_id: "u1", kind: "text", body: "hi", moderation: "clean", created_at: "t", attachments: [] },
    });
    expect(result.status).toBe("sent");
    if (result.status === "sent") expect(result.message.body).toBe("hi");
  });

  it("throws on an unexpected shape", () => {
    expect(() => parseSendResult(null)).toThrow();
    expect(() => parseSendResult({ status: "weird" })).toThrow();
  });
});

describe("contactWarning", () => {
  it("explains a restriction differently from a first warning", () => {
    expect(contactWarning({ kinds: ["email"], restricted: false })).toMatch(/e-mail addresses/);
    expect(contactWarning({ kinds: ["social"], restricted: true })).toMatch(/paused/);
  });
});

describe("sendMessageSchema", () => {
  it("needs text or an attachment in the conversation's own folder layout", () => {
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ body: "hi" }).success).toBe(true);
    expect(
      sendMessageSchema.safeParse({
        body: "",
        attachment: { storage_path: "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/a.webp" },
      }).success,
    ).toBe(true);
    expect(sendMessageSchema.safeParse({ body: "", attachment: { storage_path: "../etc/passwd" } }).success).toBe(false);
  });
});
