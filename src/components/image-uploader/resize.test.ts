import { describe, expect, it } from "vitest";

import { fitWithin, formatBytes, validateImageFile, webpFileName } from "./resize";

describe("fitWithin", () => {
  it("scales the long edge down to the maximum and keeps the aspect ratio", () => {
    expect(fitWithin({ width: 4000, height: 3000 })).toEqual({ width: 1920, height: 1440 });
    expect(fitWithin({ width: 3000, height: 4000 })).toEqual({ width: 1440, height: 1920 });
    expect(fitWithin({ width: 6000, height: 6000 }, 1000)).toEqual({ width: 1000, height: 1000 });
  });

  it("never upscales", () => {
    expect(fitWithin({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
    expect(fitWithin({ width: 1920, height: 1080 })).toEqual({ width: 1920, height: 1080 });
  });

  it("keeps extreme panoramas at least 1 px tall", () => {
    expect(fitWithin({ width: 20000, height: 4 })).toEqual({ width: 1920, height: 1 });
  });

  it("rejects non-positive dimensions", () => {
    expect(() => fitWithin({ width: 0, height: 100 })).toThrow(RangeError);
    expect(() => fitWithin({ width: 100, height: Number.NaN })).toThrow(RangeError);
  });
});

describe("webpFileName", () => {
  it("swaps the extension and slugifies", () => {
    expect(webpFileName("IMG 0012.JPEG")).toBe("img-0012.webp");
    expect(webpFileName("living.room.final.png")).toBe("living-room-final.webp");
  });

  it("drops path segments and unsafe characters", () => {
    expect(webpFileName("../../etc/passwd.png")).toBe("passwd.webp");
    expect(webpFileName("C:\\photos\\Room #1 (new).jpg")).toBe("room-1-new.webp");
  });

  it("falls back to a default name", () => {
    expect(webpFileName(".png")).toBe("image.webp");
    expect(webpFileName("कमरा.jpg")).toBe("image.webp");
  });
});

describe("validateImageFile", () => {
  const options = { maxBytes: 8 * 1024 * 1024 };

  it("accepts supported images within the limit", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 1000, name: "a.jpg" }, options)).toBeNull();
    expect(validateImageFile({ type: "image/webp", size: options.maxBytes, name: "a.webp" }, options)).toBeNull();
  });

  it("rejects other types, empty files and oversized files", () => {
    expect(validateImageFile({ type: "application/pdf", size: 10, name: "a.pdf" }, options)?.code).toBe("unsupported_type");
    expect(validateImageFile({ type: "image/gif", size: 10, name: "a.gif" }, options)?.code).toBe("unsupported_type");
    expect(validateImageFile({ type: "image/png", size: 0, name: "a.png" }, options)?.code).toBe("empty");
    const tooLarge = validateImageFile({ type: "image/png", size: options.maxBytes + 1, name: "big.png" }, options);
    expect(tooLarge?.code).toBe("too_large");
    expect(tooLarge?.message).toBe("big.png is larger than 8 MB.");
  });

  it("honours a custom accept list", () => {
    expect(validateImageFile({ type: "application/pdf", size: 10, name: "a.pdf" }, { ...options, accept: ["application/pdf"] })).toBeNull();
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(8 * 1024 * 1024)).toBe("8 MB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12 MB");
  });
});
