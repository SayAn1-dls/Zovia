import { describe, expect, it } from "vitest";

import { paginationRange } from "./pagination";

describe("paginationRange", () => {
  it("lists every page when there are few", () => {
    expect(paginationRange(1, 1)).toEqual([1]);
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("collapses the middle with gaps", () => {
    expect(paginationRange(1, 20)).toEqual([1, 2, 3, 4, "gap", 20]);
    expect(paginationRange(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(paginationRange(20, 20)).toEqual([1, "gap", 17, 18, 19, 20]);
  });

  it("fills a one-page hole instead of showing a gap", () => {
    expect(paginationRange(4, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
  });

  it("clamps out-of-range input", () => {
    expect(paginationRange(99, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(-4, 3)).toEqual([1, 2, 3]);
    expect(paginationRange(1, 0)).toEqual([1]);
  });
});
