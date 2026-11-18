import { render, screen } from "@testing-library/react";
import type { Route } from "next";
import { describe, expect, it, vi } from "vitest";

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

import { AuthSwitchLink, hrefWithNext } from "./auth-switch-link";

describe("hrefWithNext", () => {
  it("keeps a same-origin next, so Book now -> Create an account returns to the booking", () => {
    const next = "/book/sunrise-pg?checkin=2026-12-01&checkout=2026-12-03&rooms=double@2";
    expect(hrefWithNext("/sign-up" as Route, next)).toBe(`/sign-up?next=${encodeURIComponent(next)}`);
  });

  it("drops a missing or unsafe next", () => {
    expect(hrefWithNext("/sign-up" as Route, null)).toBe("/sign-up");
    expect(hrefWithNext("/sign-up" as Route, "https://evil.example/")).toBe("/sign-up");
    expect(hrefWithNext("/sign-up" as Route, "//evil.example")).toBe("/sign-up");
  });
});

describe("AuthSwitchLink", () => {
  it("links with the current page's next", () => {
    search = new URLSearchParams({ next: "/book/sunrise-pg?rooms=single@1" });
    render(<AuthSwitchLink href={"/sign-up" as Route}>Create an account</AuthSwitchLink>);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      `/sign-up?next=${encodeURIComponent("/book/sunrise-pg?rooms=single@1")}`,
    );
  });
});
