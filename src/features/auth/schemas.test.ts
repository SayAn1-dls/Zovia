import { describe, expect, it } from "vitest";

import { newPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema } from "./schemas";

describe("newPasswordSchema", () => {
  it("mirrors the Auth server rules: 8+ characters with letters and digits", () => {
    expect(newPasswordSchema.safeParse("testpass123").success).toBe(true);
    expect(newPasswordSchema.safeParse("short1").success).toBe(false);
    expect(newPasswordSchema.safeParse("onlyletters").success).toBe(false);
    expect(newPasswordSchema.safeParse("12345678").success).toBe(false);
    expect(newPasswordSchema.safeParse(`a1${"x".repeat(71)}`).success).toBe(false);
  });
});

describe("signUpSchema", () => {
  it("trims the name and e-mail and rejects invalid addresses", () => {
    const ok = signUpSchema.parse({ full_name: "  Asha  ", email: " asha@example.com ", password: "testpass123" });
    expect(ok.full_name).toBe("Asha");
    expect(ok.email).toBe("asha@example.com");
    expect(signUpSchema.safeParse({ full_name: "Asha", email: "not-an-email", password: "testpass123" }).success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("does not apply the new-password rules to existing passwords", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "x" }).success).toBe(true);
    expect(signInSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("requires the confirmation to match, reported on confirm_password", () => {
    const result = resetPasswordSchema.safeParse({ password: "testpass123", confirm_password: "testpass124" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["confirm_password"]);
  });
});
