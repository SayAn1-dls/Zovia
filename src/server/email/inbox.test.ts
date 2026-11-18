import { describe, expect, it } from "vitest";

import { canonicalEmail, isOwnInbox, OWNER_INBOX } from "./inbox";

describe("canonicalEmail", () => {
  it("lower-cases and trims", () => {
    expect(canonicalEmail("  Name@Example.COM ")).toBe("name@example.com");
  });

  it("ignores dots and plus-tags for Gmail only", () => {
    expect(canonicalEmail("A.B.C+news@gmail.com")).toBe("abc@gmail.com");
    expect(canonicalEmail("a.b.c+news@googlemail.com")).toBe("abc@gmail.com");
    expect(canonicalEmail("a.b.c+news@example.com")).toBe("a.b.c+news@example.com");
  });

  it("leaves things that are not an address alone", () => {
    expect(canonicalEmail("not-an-address")).toBe("not-an-address");
    expect(canonicalEmail("@gmail.com")).toBe("@gmail.com");
  });
});

describe("isOwnInbox", () => {
  it("rejects the owner inbox in any spelling", () => {
    expect(isOwnInbox(OWNER_INBOX)).toBe(true);
    expect(isOwnInbox("SAYAN.BH.WORK@GMAIL.COM")).toBe(true);
    expect(isOwnInbox("sayanbhwork@gmail.com")).toBe(true);
    expect(isOwnInbox("sayan.bh.work+feedback@gmail.com")).toBe(true);
    expect(isOwnInbox("s.a.y.a.n.b.h.w.o.r.k@googlemail.com")).toBe(true);
    expect(isOwnInbox(" sayan.bh.work@gmail.com ")).toBe(true);
  });

  it("rejects an overridden inbox too", () => {
    expect(isOwnInbox("team@zovia.in", "Team@Zovia.in")).toBe(true);
    expect(isOwnInbox("someone@zovia.in", "team@zovia.in")).toBe(false);
  });

  it("accepts every other address", () => {
    expect(isOwnInbox("visitor@gmail.com")).toBe(false);
    expect(isOwnInbox("sayan.bh.work2@gmail.com")).toBe(false);
    expect(isOwnInbox("sayan.bh.work@example.com")).toBe(false);
    expect(isOwnInbox("sayan.bhattacharya2024@nst.rishihood.edu.in")).toBe(false);
  });

  it("ignores an empty extra inbox", () => {
    expect(isOwnInbox("visitor@gmail.com", "")).toBe(false);
  });
});
