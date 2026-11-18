// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signPhotoName, verifyPhotoSignature } from "./photo-token";

const NAME = "places/ChIJabc/photos/Xyz_1";

describe("photo signatures", () => {
  it("accepts the signature the server issued", () => {
    expect(verifyPhotoSignature(NAME, signPhotoName(NAME, "key-1"), "key-1")).toBe(true);
  });
  it("refuses missing, malformed, other-name and other-key signatures", () => {
    const sig = signPhotoName(NAME, "key-1");
    expect(verifyPhotoSignature(NAME, undefined, "key-1")).toBe(false);
    expect(verifyPhotoSignature(NAME, "nope", "key-1")).toBe(false);
    expect(verifyPhotoSignature("places/other/photos/Xyz_1", sig, "key-1")).toBe(false);
    expect(verifyPhotoSignature(NAME, sig, "key-2")).toBe(false);
  });
});
