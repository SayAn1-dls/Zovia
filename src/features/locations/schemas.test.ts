import { describe, expect, it } from "vitest";

import { geocodeQuerySchema, googlePhotoQuerySchema, isInIndia, nearbyQuerySchema } from "./schemas";

describe("nearbyQuerySchema", () => {
  it("accepts a point in India from query strings", () => {
    expect(nearbyQuerySchema.parse({ lat: "28.99", lng: "77.01" })).toEqual({ lat: 28.99, lng: 77.01 });
  });

  it("refuses points outside India and garbage", () => {
    expect(nearbyQuerySchema.safeParse({ lat: "51.5", lng: "-0.12" }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "abc", lng: "77" }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "28.9" }).success).toBe(false);
  });
});

describe("geocodeQuerySchema", () => {
  it("needs at least 3 characters", () => {
    expect(geocodeQuerySchema.safeParse({ q: " ab " }).success).toBe(false);
    expect(geocodeQuerySchema.parse({ q: "  Koramangala " }).q).toBe("Koramangala");
  });
});

describe("googlePhotoQuerySchema", () => {
  it("accepts only Places photo resource names", () => {
    expect(googlePhotoQuerySchema.safeParse({ name: "places/ChIJ123/photos/AbC_-9" }).success).toBe(true);
    expect(googlePhotoQuerySchema.safeParse({ name: "https://evil.example/x" }).success).toBe(false);
    expect(googlePhotoQuerySchema.safeParse({ name: "places/a/photos/b/../../x" }).success).toBe(false);
  });
});

describe("isInIndia", () => {
  it("uses the same box as the database check", () => {
    expect(isInIndia({ lat: 12.97, lng: 77.59 })).toBe(true);
    expect(isInIndia({ lat: 0, lng: 0 })).toBe(false);
    expect(isInIndia({ lat: 77.59, lng: 12.97 })).toBe(false);
  });
});
