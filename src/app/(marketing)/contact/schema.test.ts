import { describe, expect, it } from "vitest";

import { apiEnvelopeSchema, contactFormDefaults, contactFormSchema, toContactPayload } from "./schema";

const valid = {
  ...contactFormDefaults,
  name: "Asha Rao",
  email: "asha@example.com",
  subject: "Listing question",
  message: "How do I add more photos to my listing?",
};

describe("contactFormSchema", () => {
  it("accepts a valid message and trims whitespace", () => {
    const parsed = contactFormSchema.parse({ ...valid, name: "  Asha Rao  ", email: " asha@example.com " });
    expect(parsed.name).toBe("Asha Rao");
    expect(parsed.email).toBe("asha@example.com");
  });

  it("rejects missing and malformed fields with friendly messages", () => {
    const result = contactFormSchema.safeParse({ ...contactFormDefaults, email: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const messages = Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
    expect(messages.name).toBe("Enter your name.");
    expect(messages.email).toBe("Enter a valid e-mail address, like name@example.com.");
    expect(messages.subject).toBe("Add a short subject.");
    expect(messages.message).toBe("Tell us a little more (at least 10 characters).");
    expect(messages.phone).toBeUndefined();
  });

  it("treats the phone number as optional but validates it when present", () => {
    expect(contactFormSchema.safeParse({ ...valid, phone: "" }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...valid, phone: "+91 98765 43210" }).success).toBe(true);
    expect(contactFormSchema.safeParse({ ...valid, phone: "call me" }).success).toBe(false);
  });
});

describe("toContactPayload", () => {
  it("omits an empty phone and keeps the honeypot field", () => {
    expect(toContactPayload(valid)).toEqual({
      name: "Asha Rao",
      email: "asha@example.com",
      subject: "Listing question",
      message: "How do I add more photos to my listing?",
      website: "",
    });
    expect(toContactPayload({ ...valid, phone: "+919876543210" }).phone).toBe("+919876543210");
  });
});

describe("apiEnvelopeSchema", () => {
  it("parses success and failure envelopes and rejects anything else", () => {
    expect(apiEnvelopeSchema.safeParse({ ok: true, data: { id: "x" } }).success).toBe(true);
    expect(
      apiEnvelopeSchema.safeParse({ ok: false, error: { code: "rate_limited", message: "Slow down" } }).success,
    ).toBe(true);
    expect(apiEnvelopeSchema.safeParse({ ok: false }).success).toBe(false);
    expect(apiEnvelopeSchema.safeParse("<html>").success).toBe(false);
  });
});
